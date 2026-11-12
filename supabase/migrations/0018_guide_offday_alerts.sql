-- 「평가 길잡이」 앱: 주말·휴일 일정 안내(푸시 + 앱 알림), 센터에 메모 남기기
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)

-- ========== 1. 푸시 토큰: 선생님 폰이 알림을 받을 주소(FCM 등록 토큰) ==========
create table if not exists public.guide_push_tokens (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists guide_push_tokens_employee_idx on public.guide_push_tokens(employee_id);

-- ========== 2. 안내(알림) 기록: 누구에게 무슨 안내를 언제 보냈고, 확인했는지 ==========
create table if not exists public.guide_alerts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'offday',
  alert_date date not null,                      -- 안내를 보낸 날(쉬는 날 전 마지막 근무일)
  title text not null,
  body text not null,
  items jsonb not null default '[]'::jsonb,      -- [{ elder, visits: [{ date, start, end }] }]
  push_sent_at timestamptz,
  push_result text,                              -- 예: "2대 중 2대 보냄" / 실패 사유
  acked_at timestamptz,                          -- 선생님이 앱에서 「확인했습니다」를 누른 시각
  created_at timestamptz not null default now(),
  unique (employee_id, kind, alert_date)
);
create index if not exists guide_alerts_date_idx on public.guide_alerts(alert_date);

-- ========== 3. 센터에 남기는 메모(앱 → 관리자 「메모함」) ==========
create table if not exists public.guide_memos (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  elder_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.profiles(id) on delete set null
);
create index if not exists guide_memos_created_idx on public.guide_memos(created_at desc);
create index if not exists guide_memos_employee_idx on public.guide_memos(employee_id);

-- ========== 4. 임시공휴일 등 표에 없는 쉬는 날(여기에 날짜를 넣으면 안내 날짜 계산에 반영) ==========
create table if not exists public.guide_holidays (
  day date primary key,
  name text
);

alter table public.guide_push_tokens enable row level security;
alter table public.guide_alerts enable row level security;
alter table public.guide_memos enable row level security;
alter table public.guide_holidays enable row level security;

-- 앱·서버는 서비스 키로만 읽고 씁니다. 관리자 웹은 로그인한 관리자로 읽습니다.
drop policy if exists "guide_alerts_admin" on public.guide_alerts;
create policy "guide_alerts_admin" on public.guide_alerts for select using (public.is_admin());
drop policy if exists "guide_memos_admin" on public.guide_memos;
create policy "guide_memos_admin" on public.guide_memos for select using (public.is_admin());
drop policy if exists "guide_holidays_admin" on public.guide_holidays;
create policy "guide_holidays_admin" on public.guide_holidays for all using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

-- 확인용: 네 칸 모두 값이 나오면 성공
select to_regclass('public.guide_push_tokens') as tokens_table,
       to_regclass('public.guide_alerts') as alerts_table,
       to_regclass('public.guide_memos') as memos_table,
       to_regclass('public.guide_holidays') as holidays_table;
