-- profiles.role 체크 제약조건이 갱신되지 않았을 경우를 대비한 재실행용 스크립트
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('employee','social_worker','admin'));
