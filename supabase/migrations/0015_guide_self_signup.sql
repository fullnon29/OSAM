-- 「평가 길잡이」 앱 자체 가입: 선생님이 현장에서 직접 가입(센터 사전 등록 불필요), 건강검진 결과 사진 올리기
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)

-- 직원이 어디서 등록됐는지 (admin: 관리자 화면 / app: 앱에서 스스로 가입)
alter table public.profiles add column if not exists registered_via text not null default 'admin';

-- 앱 가입 시도 기록에 "새로 가입했는지" 표시 (같은 곳에서 짧은 시간에 너무 많이 가입하면 막음)
alter table public.guide_link_attempts add column if not exists created_new boolean not null default false;

-- 건강검진 결과통보서 사진 (평가지표 9: 결핵 포함 연 1회 건강검진)
create table if not exists public.guide_health_checks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  photo_path text not null,                 -- health-checks 버킷 경로
  uploaded_at timestamptz not null default now()
);
create index if not exists guide_health_checks_employee_idx on public.guide_health_checks(employee_id);

alter table public.guide_health_checks enable row level security;
drop policy if exists "guide_health_checks_admin_or_own" on public.guide_health_checks;
create policy "guide_health_checks_admin_or_own" on public.guide_health_checks
  for select using (public.is_admin() or employee_id = auth.uid());
drop policy if exists "guide_health_checks_write_admin" on public.guide_health_checks;
create policy "guide_health_checks_write_admin" on public.guide_health_checks
  for all using (public.is_admin()) with check (public.is_admin());

-- 사진 버킷 (비공개, 서버가 서비스 키로만 읽고 씀)
insert into storage.buckets (id, name, public)
  values ('health-checks', 'health-checks', false)
  on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- 확인용: 세 칸 모두 값이 나오면 성공
select to_regclass('public.guide_health_checks') as health_table,
       (select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'registered_via') as profile_column,
       (select count(*) from storage.buckets where id = 'health-checks') as photo_bucket;
