-- 직원 명단 연동(OSAM 데스크톱 앱 「직원 명단 연동」): 포털 직원_다운로드 양식의 친족케어·건강검진(최종) 칸
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)
-- 이 SQL 을 실행하지 않아도 앱은 동작합니다(두 항목만 올리지 않고 안내합니다). 실행한 뒤 명단을 다시 연동하면 채워집니다.

-- 친족케어(가족 요양) 여부 — 포털 직원 현황의 ○
alter table public.profiles add column if not exists kin_care boolean not null default false;

-- 건강검진 최종일 — 포털 직원 현황의 「건강검진(최종)」. 평가지표 9(연 1회 건강검진) 점검에 씁니다.
alter table public.profiles add column if not exists health_checked_at date;

notify pgrst, 'reload schema';

-- 확인용: 2 가 나오면 성공
select count(*) as new_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name in ('kin_care', 'health_checked_at');
