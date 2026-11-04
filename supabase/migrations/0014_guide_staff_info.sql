-- 「평가 길잡이」 앱 최초 실행: 선생님이 성함·생년월일·전화번호를 입력하면 센터 등록 정보와 맞을 때 연결,
-- 담당 어르신과 케어 시 주의점을 입력해 센터와 공유.
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)

-- ========== 1. profiles: 앱 연결 확인용 생년월일·전화번호 (관리자가 「종사자 계정 관리」에서 등록) ==========
alter table public.profiles add column if not exists birth_yymmdd text;  -- 예: 650312
alter table public.profiles add column if not exists phone text;         -- 숫자만, 예: 01012345678

-- ========== 2. guide_staff_cares: 선생님이 입력한 담당 어르신과 케어 시 주의점 ==========
create table if not exists public.guide_staff_cares (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  elder_name text not null,
  cautions text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists guide_staff_cares_employee_idx on public.guide_staff_cares(employee_id);

-- ========== 3. guide_link_attempts: 정보 입력 연결 시도 기록 (같은 곳에서 계속 틀리면 잠시 막음) ==========
create table if not exists public.guide_link_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text,
  ok boolean not null,
  employee_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists guide_link_attempts_ip_idx on public.guide_link_attempts(ip, created_at);

-- 기기마다 어떻게 연결했는지 (qr | info)
alter table public.guide_devices add column if not exists link_method text not null default 'qr';

alter table public.guide_staff_cares enable row level security;
alter table public.guide_link_attempts enable row level security;

drop policy if exists "guide_staff_cares_admin_or_own" on public.guide_staff_cares;
create policy "guide_staff_cares_admin_or_own" on public.guide_staff_cares
  for select using (public.is_admin() or employee_id = auth.uid());
drop policy if exists "guide_staff_cares_write_admin" on public.guide_staff_cares;
create policy "guide_staff_cares_write_admin" on public.guide_staff_cares
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "guide_link_attempts_admin" on public.guide_link_attempts;
create policy "guide_link_attempts_admin" on public.guide_link_attempts
  for select using (public.is_admin());

-- 사이트(API)가 새 표·칸을 바로 알아보도록
notify pgrst, 'reload schema';

-- 확인용: 세 칸 모두 값이 나오면 성공
select to_regclass('public.guide_staff_cares') as cares_table,
       to_regclass('public.guide_link_attempts') as attempts_table,
       (select count(*) from information_schema.columns where table_name = 'profiles' and column_name in ('birth_yymmdd','phone')) as profile_columns;
