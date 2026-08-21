-- 기록이 어떤 서식으로 작성되었는지 남깁니다.
--
-- 서식은 해마다 개정되는데 문항 정의가 한 벌뿐이면, 서식을 고치는 순간 과거
-- 기록의 답이 바뀐 문항에 붙어 잘못 표시됩니다. 작성 당시 버전을 함께 저장해
-- 두면 과거 기록은 언제나 그때 서식으로 읽고 출력할 수 있습니다.
--
-- 기존 기록은 모두 2026년 기본서식으로 작성된 것이므로 기본값을 '2026'으로 둡니다.

alter table public.needs_assessments
  add column if not exists form_version text not null default '2026';

comment on column public.needs_assessments.form_version is
  '작성에 사용된 서식 버전 id (src/lib/forms 의 FORM_VERSIONS.id와 대응). 한번 저장되면 변경하지 않음';
