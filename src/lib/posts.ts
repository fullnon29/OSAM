export type Post = {
  id: string;
  title: string;
  category: string;
  excerpt: string | null;
  content: string;
  read_minutes: number | null;
  is_published: boolean;
  published_at: string;
  created_at: string;
  thumbnail_url: string | null;
};

export const POST_CATEGORIES = ["센터 소식", "요양 정보", "건강 팁"] as const;

export function categoryTagClass(category: string) {
  if (category === "요양 정보") return "tag-info";
  if (category === "건강 팁") return "tag-tip";
  return "";
}

const CATEGORY_FALLBACK_IMAGE: Record<string, string> = {
  "센터 소식": "/news/center-news.jpg",
  "요양 정보": "/news/care-info.jpg",
  "건강 팁": "/news/health-tip.jpg",
};

export function postThumbnail(post: Pick<Post, "thumbnail_url" | "category">) {
  return post.thumbnail_url || CATEGORY_FALLBACK_IMAGE[post.category] || "/news/center-news.jpg";
}
