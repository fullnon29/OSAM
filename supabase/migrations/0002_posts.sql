-- 소식·정보 게시판
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '센터 소식' check (category in ('센터 소식','요양 정보','건강 팁')),
  excerpt text,
  content text not null,
  read_minutes int,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- 공개된 글은 누구나(비로그인 포함) 조회, 비공개 글은 관리자만
create policy "posts_select_published_or_admin" on public.posts
  for select using (is_published = true or public.is_admin());

-- 작성/수정/삭제는 관리자만
create policy "posts_write_admin" on public.posts
  for all using (public.is_admin()) with check (public.is_admin());
