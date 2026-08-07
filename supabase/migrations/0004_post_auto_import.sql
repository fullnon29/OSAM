-- 자동 수집 글의 출처 추적/중복 방지용 컬럼
alter table public.posts add column if not exists source text;
alter table public.posts add column if not exists source_id text;
alter table public.posts add column if not exists source_url text;

create unique index if not exists posts_source_unique
  on public.posts (source, source_id)
  where source is not null;
