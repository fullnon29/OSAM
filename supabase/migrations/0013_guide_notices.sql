-- 「평가 길잡이」 앱 공지: 관리자가 쓰고, 선생님이 앱에서 읽고 「확인했습니다」를 누르면 기록
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)

create table if not exists public.guide_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_url text,                                   -- 교육 자료 등 바깥 링크 (선택)
  requires_ack boolean not null default true,      -- 「확인했습니다」 기록이 필요한 공지
  is_active boolean not null default true,         -- 내리면 앱에서 보이지 않음 (기록은 남김)
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.guide_notice_reads (
  notice_id uuid not null references public.guide_notices(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, employee_id)
);

alter table public.guide_notices enable row level security;
alter table public.guide_notice_reads enable row level security;

drop policy if exists "guide_notices_admin" on public.guide_notices;
create policy "guide_notices_admin" on public.guide_notices
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "guide_notice_reads_admin_or_own" on public.guide_notice_reads;
create policy "guide_notice_reads_admin_or_own" on public.guide_notice_reads
  for select using (public.is_admin() or employee_id = auth.uid());

-- 사이트(API)가 새 표를 바로 알아보도록 표 목록을 새로 읽게 한다
notify pgrst, 'reload schema';

-- 확인용: 아래 결과가 두 줄 모두 표 이름으로 나오면 성공 (빈칸이면 실패)
select to_regclass('public.guide_notices') as notices_table, to_regclass('public.guide_notice_reads') as reads_table;
