-- 게시글 썸네일 이미지 URL 컬럼 추가
alter table public.posts add column if not exists thumbnail_url text;
