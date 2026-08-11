-- 종사자 입사일 컬럼 추가
alter table public.profiles add column if not exists hired_at date;
