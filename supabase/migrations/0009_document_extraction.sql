-- 과거 욕구사정 서류에서 읽어낸 문항별 응답 (요구사항 2)
--
-- 서식이 연도마다 달라 위치로는 읽을 수 없어 AI로 해석합니다. 해석 결과는
-- 추정값이므로 정식 기록(needs_assessments)에 바로 넣지 않고 원본 서류에
-- 붙여 둡니다. 새 회차를 쓸 때 이 값을 불러와 사람이 확인·수정한 뒤 저장합니다.
-- 이렇게 두면 어디서 온 값인지 원본까지 되짚을 수 있습니다.

alter table public.care_documents
  add column if not exists extracted_responses jsonb,
  add column if not exists document_date date,
  add column if not exists extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'done', 'failed', 'skipped')),
  add column if not exists extraction_error text,
  add column if not exists extracted_at timestamptz;

comment on column public.care_documents.extracted_responses is
  'AI가 원본에서 읽어낸 문항별 응답(추정값). 사람이 확인하기 전까지 정식 기록이 아님';
comment on column public.care_documents.document_date is
  '서류에 적힌 작성일. 어느 것이 최신 기록인지 고르는 데 씁니다';

-- 아직 해석하지 않은 욕구사정 서류를 골라내는 데 씁니다.
create index if not exists care_documents_extraction_idx
  on public.care_documents (extraction_status)
  where extraction_status = 'pending';
