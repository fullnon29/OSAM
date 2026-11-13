-- 서류정리 도구의 「RFID 자동 점검」 실행 기록.
-- 여러 사람이 같은 프로그램을 쓰므로, 같은 날(같은 주)의 점검을 한 곳에서만 돌리기 위한 자물쇠입니다.
-- 도구는 점검을 시작하기 전에 run_key 한 줄을 넣어 보고, 이미 있으면(기록이 있으면) 실행하지 않습니다.
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)

create table if not exists public.guide_auto_runs (
  run_key text primary key,                         -- 예: rfid-daily:2026-11-12 / rfid-weekly:2026-11-02(그 주 월요일)
  kind text not null,                               -- rfid-daily | rfid-weekly
  target_from date not null,                        -- 점검한 급여제공일 시작
  target_to date not null,                          -- 점검한 급여제공일 끝
  claimed_by text not null,                         -- 실행한 컴퓨터(PC 이름)
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',           -- running | done | failed
  summary text                                      -- 결과 한 줄(읽은 건수·고칠 줄 등)
);

alter table public.guide_auto_runs enable row level security;

-- 도구는 서비스 키로만 읽고 씁니다. 관리자 웹은 로그인한 관리자로 읽습니다.
drop policy if exists "guide_auto_runs_admin" on public.guide_auto_runs;
create policy "guide_auto_runs_admin" on public.guide_auto_runs for select using (public.is_admin());
