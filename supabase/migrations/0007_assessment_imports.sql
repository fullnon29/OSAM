-- 보관 중인 과거 욕구사정 hwp 파일을 읽어들이기 위한 스키마.
--
-- 과거 파일은 연도마다 서식이 달라(2023/2024/2025 각각 다름) 문항 위치를
-- 기계적으로 특정할 수 없습니다. 그래서 파일에서 뽑은 값을 곧바로
-- needs_assessments에 넣지 않고, 먼저 이 표에 "추정치"로 쌓아둔 뒤
-- 사람이 검토·승인한 것만 실제 기록으로 옮깁니다.

create table public.assessment_imports (
  id uuid primary key default gen_random_uuid(),

  -- 원본 파일 --------------------------------------------------------------
  source_filename text not null,
  source_path text,
  -- 같은 파일을 두 번 처리하지 않기 위한 내용 해시(sha256).
  -- 폴더 구조가 바뀌거나 파일명이 달라도 중복을 잡아냅니다.
  file_hash text not null unique,
  form_year text,                       -- 추정 서식 연도('2023'.. / 'unknown')
  raw_text text,                        -- 추출한 전체 본문(판단 근거 보존용)

  -- 파일에서 읽어낸 수급자 식별 정보 ---------------------------------------
  extracted_name text,
  extracted_ltc_number text,
  extracted_assessed_at date,

  -- AI가 추정한 내용 -------------------------------------------------------
  proposed_responses jsonb not null default '{}'::jsonb,  -- 문항별 추정 답
  original_summary text,                -- 원본에 적혀 있던 의견/총평 원문
  polished_summary text,                -- AI가 다듬은 총평
  confidence numeric,                   -- 문항 매핑 신뢰도(0~1)

  -- 검토·연결 --------------------------------------------------------------
  care_recipient_id uuid references public.care_recipients(id),
  needs_assessment_id uuid references public.needs_assessments(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,

  status text not null default 'pending'
    check (status in ('pending','needs_review','approved','imported','failed','skipped')),
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 검토 화면은 "상태별 + 수급자명순" 조회가 대부분입니다.
create index assessment_imports_status_idx
  on public.assessment_imports (status, extracted_name);

alter table public.assessment_imports enable row level security;

create policy "assessment_imports_all_sw_or_admin" on public.assessment_imports
  for all
  using (public.is_social_worker() or public.is_admin())
  with check (public.is_social_worker() or public.is_admin());

-- 웹에서 직접 작성한 기록과, 과거 파일에서 옮겨온 기록을 구분합니다.
-- 옮겨온 기록은 사람이 승인했더라도 원본이 따로 있으므로 출처를 남겨둡니다.
alter table public.needs_assessments
  add column if not exists source text not null default 'web'
    check (source in ('web','import'));
