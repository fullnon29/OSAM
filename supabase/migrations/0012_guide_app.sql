-- 「평가 길잡이」 앱 연동: QR 로 앱 연결, 앱에서 서명하고 이수, 평가 증빙(교육 실시 대장)
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)

-- ========== 1. courses: 증빙 필수사항(교육방법·강사명·교육내용)과 앱 연결 키 ==========
alter table public.courses add column if not exists method text;        -- 교육방법 (예: 자체교육)
alter table public.courses add column if not exists instructor text;    -- 강사명
alter table public.courses add column if not exists content text;       -- 교육내용
-- 앱이 이수하는 과정의 고유 키. 'rules-2026-H1'(운영규정 상반기), 'onboard-2026-3'(신규입문 3단계) 등
-- 이 키가 있는 과정은 홈페이지에서 바로 이수 처리하지 않고 앱에서 서명으로 이수한다.
alter table public.courses add column if not exists guide_key text;
create unique index if not exists courses_guide_key_uq on public.courses(guide_key) where guide_key is not null;

-- ========== 2. course_completions: 서명·확인 문구·이수 경로 ==========
alter table public.course_completions add column if not exists signature_path text;  -- signatures 버킷 경로
alter table public.course_completions add column if not exists confirm_text text;    -- 직원이 체크한 확인 문구
alter table public.course_completions add column if not exists source text not null default 'web'; -- web | app | admin
alter table public.course_completions add column if not exists device_info text;     -- 이수한 기기(앱 이름·브라우저 정보)

-- ========== 3. guide_link_codes: 관리자가 띄우는 1회용 QR (10분 유효) ==========
create table if not exists public.guide_link_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ========== 4. guide_devices: QR 로 연결된 앱(폰). 토큰은 해시로만 저장 ==========
create table if not exists public.guide_devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  device_info text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists guide_devices_employee_idx on public.guide_devices(employee_id);

alter table public.guide_link_codes enable row level security;
alter table public.guide_devices enable row level security;

drop policy if exists "guide_link_codes_admin" on public.guide_link_codes;
create policy "guide_link_codes_admin" on public.guide_link_codes
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "guide_devices_admin_or_own" on public.guide_devices;
create policy "guide_devices_admin_or_own" on public.guide_devices
  for select using (public.is_admin() or employee_id = auth.uid());
drop policy if exists "guide_devices_write_admin" on public.guide_devices;
create policy "guide_devices_write_admin" on public.guide_devices
  for all using (public.is_admin()) with check (public.is_admin());

-- ========== 5. 서명 이미지 버킷 (비공개, 서버가 서비스 키로만 읽고 씀) ==========
insert into storage.buckets (id, name, public)
  values ('signatures', 'signatures', false)
  on conflict (id) do nothing;
