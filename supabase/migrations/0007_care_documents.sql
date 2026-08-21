-- 수급자 서류 원본 보관 (요구사항 0, 1, 3, 7)
--
-- 실제 보관 자료를 전수 조사한 결과에 맞춰 설계했습니다.
--   전체 1,799건 · 수급자 150명
--   급여제공계획 621 / 기타 587 / 욕구사정+급여제공계획 280
--   낙상+욕창 258 / 욕구사정 48 / 욕구사정+CIST 4
--
-- 한 파일에 여러 서식이 함께 편철된 경우가 많아(욕구사정+급여제공계획 280건)
-- 문서 종류는 배열로 둡니다.

create table public.care_documents (
  id uuid primary key default gen_random_uuid(),

  -- 원본 파일 -------------------------------------------------------------
  filename text not null,
  -- 내용 해시(sha256). 파일명이나 경로가 달라도 같은 파일을 두 번 넣지 않도록 막습니다.
  file_hash text not null unique,
  storage_path text not null,
  byte_size integer not null,
  ext text not null check (ext in ('hwp', 'pdf')),

  -- 무엇이 담긴 문서인지 (한 파일에 여러 서식이 편철될 수 있어 배열) ------
  doc_types text[] not null default '{}',

  -- 본문에서 읽어낸 식별값 (요구사항 4) ------------------------------------
  extracted_name text,
  extracted_ltc_number text,
  extracted_ltc_grade text,
  -- 판단 근거 확인과 이후 재해석을 위해 본문을 그대로 보관합니다.
  raw_text text,

  -- 수급자 연결 -----------------------------------------------------------
  -- 확실하지 않으면 비워 두고 사람이 확인합니다.
  -- 잘못 연결되면 엉뚱한 어르신 기록으로 남으므로 자동 연결은 근거가 분명할 때만 합니다.
  care_recipient_id uuid references public.care_recipients(id) on delete set null,
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'auto', 'manual')),

  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- 수급자별 서류 목록 조회가 기본 동선입니다.
create index care_documents_recipient_idx
  on public.care_documents (care_recipient_id, created_at desc);
-- 미연결 서류 검토 화면용
create index care_documents_unmatched_idx
  on public.care_documents (match_status) where match_status = 'unmatched';
-- 인정번호로 수급자를 찾아 붙일 때 씁니다.
create index care_documents_ltc_number_idx
  on public.care_documents (extracted_ltc_number);
-- 종류별 조회 (욕구사정만, 낙상평가만 등)
create index care_documents_types_idx
  on public.care_documents using gin (doc_types);

alter table public.care_documents enable row level security;

create policy "care_documents_all_sw_or_admin" on public.care_documents
  for all
  using (public.is_social_worker() or public.is_admin())
  with check (public.is_social_worker() or public.is_admin());
