-- 급여제공계획서를 포털에서 받아 채울 때 쓰는 칸 (목표·종합의견 원문은 센터가 참고만 하고 선생님 앱에는 나가지 않습니다)
-- 반드시 osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서 실행하세요. (여러 번 실행해도 안전)
-- 먼저 0019_guide_care_plans.sql 이 실행되어 있어야 합니다.

alter table public.guide_care_plans add column if not exists ltc_no text;        -- 장기요양인정번호(어르신 구분용)
alter table public.guide_care_plans add column if not exists goal_text text;     -- 계획서 목표(센터 참고용)
alter table public.guide_care_plans add column if not exists opinion_text text;  -- 종합의견 전체(센터 참고용)

notify pgrst, 'reload schema';

-- 확인용: 3 이 나오면 성공
select count(*) as new_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'guide_care_plans' and column_name in ('ltc_no', 'goal_text', 'opinion_text');
