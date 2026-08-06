-- 오샘재가복지센터 종사자 교육 시스템 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요.

create extension if not exists pgcrypto;

-- ========== 1. profiles (종사자) ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_no text unique,
  name text not null,
  dept text,
  role text not null default 'employee' check (role in ('employee','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========== 2. courses (교육 과정) ==========
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  name text not null,
  category text not null,
  description text,
  duration_min int,
  youtube_url text,
  material_url text,
  is_required boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (year, name)
);

-- ========== 3. course_completions (이수 기록) ==========
create table public.course_completions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  completed_at timestamptz not null default now(),
  cert_no text not null unique,
  cert_pdf_url text,
  created_at timestamptz not null default now(),
  unique (employee_id, course_id)
);

-- ========== 4. completion_edit_logs (완료 시각 수정 이력 / 감사 로그) ==========
create table public.completion_edit_logs (
  id uuid primary key default gen_random_uuid(),
  completion_id uuid not null references public.course_completions(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  course_id uuid not null references public.courses(id),
  original_time timestamptz not null,
  new_time timestamptz not null,
  reason text not null,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now()
);

-- ========== 5. consultation_requests (상담 신청) ==========
create table public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  guardian_name text not null,
  phone text not null,
  elder_name text,
  grade text,
  message text,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);

-- ========== 관리자 판별 헬퍼 함수 (RLS 재귀 방지용 security definer) ==========
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ========== RLS 활성화 ==========
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_completions enable row level security;
alter table public.completion_edit_logs enable row level security;
alter table public.consultation_requests enable row level security;

-- profiles
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_write_admin" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- courses: 로그인한 종사자는 전체 조회, 쓰기는 관리자만
create policy "courses_select_authenticated" on public.courses
  for select using (auth.role() = 'authenticated');
create policy "courses_write_admin" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- course_completions: 본인 것 조회/등록, 시각 수정은 관리자만
-- (실제 쓰기는 서버 API 라우트에서 service role 키로 처리하지만, 방어적으로 정책도 걸어둡니다)
create policy "completions_select_own_or_admin" on public.course_completions
  for select using (employee_id = auth.uid() or public.is_admin());
create policy "completions_write_admin" on public.course_completions
  for all using (public.is_admin()) with check (public.is_admin());

-- completion_edit_logs: 관리자만 기록/조회 (본인 이력도 조회 허용)
create policy "edit_logs_select_admin_or_own" on public.completion_edit_logs
  for select using (public.is_admin() or employee_id = auth.uid());
create policy "edit_logs_write_admin" on public.completion_edit_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- consultation_requests: 누구나(비로그인 포함) 등록 가능, 조회/처리는 관리자만
create policy "consultation_insert_public" on public.consultation_requests
  for insert with check (true);
create policy "consultation_manage_admin" on public.consultation_requests
  for select using (public.is_admin());
create policy "consultation_update_admin" on public.consultation_requests
  for update using (public.is_admin());

-- ========== Storage 버킷 (비공개, 서버가 signed URL로만 접근) ==========
insert into storage.buckets (id, name, public)
  values ('certificates', 'certificates', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('materials', 'materials', false)
  on conflict (id) do nothing;
