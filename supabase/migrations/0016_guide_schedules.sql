-- 「평가 길잡이」 앱 일정표: 관리자가 월초 「서비스일정표」 PDF 를 올리면 방문 일정(날짜·시간·어르신·방문직원)만 저장해
-- 그 선생님 앱의 「내 일정」 에 보여 준다. 등급·본인부담 금액은 저장하지 않는다.
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)

create table if not exists public.guide_schedules (
  id uuid primary key default gen_random_uuid(),
  month text not null unique check (month ~ '^\d{4}-\d{2}$'),   -- 「2026-11」. 같은 달을 다시 올리면 바꿔 넣는다
  file_name text,
  page_count int,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.guide_schedule_visits (
  id bigint generated always as identity primary key,
  schedule_id uuid not null references public.guide_schedules(id) on delete cascade,
  month text not null,
  day int not null check (day between 1 and 31),
  start_time text not null,                                        -- 「08:00」
  end_time text not null,
  elder_name text not null,
  staff_name text not null,                                        -- 일정표에 적힌 방문직원 이름
  employee_id uuid references public.profiles(id) on delete set null, -- 이름으로 맞춘 직원 (못 맞추면 비움)
  service text not null default '방문요양',
  tags text[] not null default '{}'                                -- 「가족」「인지」
);
create index if not exists guide_schedule_visits_emp on public.guide_schedule_visits (employee_id, month);
create index if not exists guide_schedule_visits_sched on public.guide_schedule_visits (schedule_id);

alter table public.guide_schedules enable row level security;
alter table public.guide_schedule_visits enable row level security;

drop policy if exists "guide_schedules_admin" on public.guide_schedules;
create policy "guide_schedules_admin" on public.guide_schedules
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "guide_schedule_visits_admin_or_own" on public.guide_schedule_visits;
create policy "guide_schedule_visits_admin_or_own" on public.guide_schedule_visits
  for select using (public.is_admin() or employee_id = auth.uid());

-- 사이트(API)가 새 표를 바로 알아보도록 표 목록을 새로 읽게 한다
notify pgrst, 'reload schema';

-- 확인용: 아래 결과가 두 칸 모두 표 이름으로 나오면 성공 (빈칸이면 실패)
select to_regclass('public.guide_schedules') as schedules_table, to_regclass('public.guide_schedule_visits') as visits_table;
