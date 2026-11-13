-- 「평가 길잡이」 앱: 어르신별 급여제공계획(유의사항·시간 분배) + 센터 코멘트, 선생님 앱에 보일 항목을 센터가 지정
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)

-- 어르신 한 분당 최신 계획서 한 건. elder_key = 공백을 뺀 어르신 이름.
create table if not exists public.guide_care_plans (
  id uuid primary key default gen_random_uuid(),
  elder_key text not null unique,
  elder_name text not null,
  plan_no text,                                   -- 급여제공계획서 번호
  applied_from date,                              -- 적용기간 시작
  applied_to date,                                -- 적용기간 끝
  written_at date,                                -- 작성일
  cautions jsonb not null default '[]'::jsonb,    -- 유의사항(특이사항) [{ "text": "...", "visible": true }]
  time_alloc jsonb not null default '[]'::jsonb,  -- 시간 분배 [{ "label": "신체활동지원", "minutes": 60, "visible": true }]
  center_comment text,                            -- 센터 코멘트(앱 카드 맨 아래)
  source text not null default 'manual',          -- manual(직접 입력) | portal(포털에서 받음)
  fetched_at timestamptz,                         -- 포털에서 받은 시각
  updated_at timestamptz not null default now(),  -- 선생님에게 보이는 내용이 마지막으로 바뀐 시각(앱의 「새 계획서」 표시용)
  created_at timestamptz not null default now()
);

-- 계획서가 새로 바뀌면 이전 본을 여기에 남깁니다.
create table if not exists public.guide_care_plan_versions (
  id uuid primary key default gen_random_uuid(),
  elder_key text not null,
  plan_no text,
  snapshot jsonb not null,
  saved_at timestamptz not null default now()
);
create index if not exists guide_care_plan_versions_key_idx on public.guide_care_plan_versions(elder_key, saved_at desc);

alter table public.guide_care_plans enable row level security;
alter table public.guide_care_plan_versions enable row level security;

-- 앱·서버·서류정리 도구는 서비스 키로만 읽고 씁니다. 관리자 웹은 로그인한 관리자로 읽습니다.
drop policy if exists "guide_care_plans_admin" on public.guide_care_plans;
create policy "guide_care_plans_admin" on public.guide_care_plans for select using (public.is_admin());
drop policy if exists "guide_care_plan_versions_admin" on public.guide_care_plan_versions;
create policy "guide_care_plan_versions_admin" on public.guide_care_plan_versions for select using (public.is_admin());

notify pgrst, 'reload schema';

-- 확인용: 두 칸 모두 값이 나오면 성공
select to_regclass('public.guide_care_plans') as plans_table, to_regclass('public.guide_care_plan_versions') as versions_table;
