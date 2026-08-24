-- 과거 서류에서 골라낸 '서술형 문장' 모음.
--
-- 두 가지 용도로 씁니다.
--   1) 센터 글투 자료 — 모든 어르신의 문장을 모아 우리 센터가 쓰는 서술 형식을
--      뽑아냅니다. 새 기록은 어느 어르신이든 이 형식으로 나옵니다.
--   2) 그 어르신의 지난 서술 — 새 회차를 쓸 때 같은 어르신의 과거 문장을
--      곁에 두고 참고합니다. 과거와 현재 병력이 어긋나지 않게 하기 위함입니다.
--
-- 원본 서류에서 규칙으로 잘라낸 것이라 언제든 다시 만들 수 있고,
-- 어느 서류의 어느 자리에서 나온 문장인지 되짚을 수 있습니다.

create table if not exists public.narrative_samples (
  id uuid primary key default gen_random_uuid(),

  -- 어느 어르신, 어느 서류에서 나왔는지. 서류가 지워지면 함께 지웁니다.
  care_recipient_id uuid references public.care_recipients(id) on delete cascade,
  document_id uuid not null references public.care_documents(id) on delete cascade,

  -- 공단 세부내용 항목에 맞춘 갈래
  -- (신체상태·질병상태·인지상태·의사소통·영양상태·가족환경·주관적욕구·자원이용·총평)
  section text not null,
  -- 서류에 적혀 있던 원래 항목 제목. 갈래가 잘못 잡혔는지 확인할 때 씁니다.
  heading text,

  body text not null,
  -- 서류에 적힌 작성일. 최신 문장을 고르는 데 씁니다.
  document_date date,

  created_at timestamptz not null default now()
);

-- 그 어르신의 지난 서술을 최신순으로 꺼냅니다.
create index if not exists narrative_samples_recipient_idx
  on public.narrative_samples (care_recipient_id, document_date desc nulls last);
-- 갈래별로 대표 문장을 고를 때 씁니다.
create index if not exists narrative_samples_section_idx
  on public.narrative_samples (section);
-- 같은 서류에서 같은 문장을 두 번 담지 않습니다. 다시 만들어도 늘어나지 않습니다.
create unique index if not exists narrative_samples_unique_idx
  on public.narrative_samples (document_id, md5(body));

alter table public.narrative_samples enable row level security;

create policy "narrative_samples_all_sw_or_admin" on public.narrative_samples
  for all
  using (public.is_social_worker() or public.is_admin())
  with check (public.is_social_worker() or public.is_admin());
