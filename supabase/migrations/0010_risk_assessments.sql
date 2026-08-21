-- 낙상·욕창 위험도 평가 결과 (요구사항 10)
--
-- 공단 평가에 별도 지표로 들어갑니다:
--   "방문요양 12 위험도 평가 - 수급자의 낙상 및 욕창 위험도, 인지기능 상태를
--    정기적으로 평가합니다" (4점)
--
-- 대개 욕구사정과 한 파일에 편철돼 있고, 점수표라 자리가 정해져 있어
-- AI 없이 그대로 읽어 옵니다.

alter table public.care_documents
  add column if not exists risk_assessments jsonb;

comment on column public.care_documents.risk_assessments is
  '낙상(Huhn)·욕창(Braden) 평가의 합계점수/위험수준/기타의견/평가일. 점수표에서 그대로 읽은 값';

-- 어르신별로 가장 최근 위험도 평가를 찾는 데 씁니다.
create index if not exists care_documents_risk_idx
  on public.care_documents (care_recipient_id)
  where risk_assessments is not null;
