-- 욕구사정 테이블만 별도로 생성 (역할 제약조건은 이미 적용되어 있으므로 제외)

create or replace function public.is_social_worker()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'social_worker'
  );
$$;

create table public.care_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date,
  gender text check (gender in ('M','F')),
  ltc_grade text,
  ltc_number text,
  address text,
  guardian_name text,
  guardian_phone text,
  memo text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.care_recipients enable row level security;

create policy "care_recipients_all_sw_or_admin" on public.care_recipients
  for all
  using (public.is_social_worker() or public.is_admin())
  with check (public.is_social_worker() or public.is_admin());

create table public.needs_assessments (
  id uuid primary key default gen_random_uuid(),
  care_recipient_id uuid not null references public.care_recipients(id) on delete cascade,
  round_no int not null,
  author_id uuid not null references public.profiles(id),
  assessed_at date not null default current_date,
  responses jsonb not null default '{}'::jsonb,
  draft_summary text,
  ai_summary text,
  final_summary text,
  status text not null default 'draft' check (status in ('draft','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (care_recipient_id, round_no)
);

alter table public.needs_assessments enable row level security;

create policy "needs_assessments_all_sw_or_admin" on public.needs_assessments
  for all
  using (public.is_social_worker() or public.is_admin())
  with check (public.is_social_worker() or public.is_admin());
