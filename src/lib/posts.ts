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
};

export const POST_CATEGORIES = ["센터 소식", "요양 정보", "건강 팁"] as const;

export function categoryTagClass(category: string) {
  if (category === "요양 정보") return "tag-info";
  if (category === "건강 팁") return "tag-tip";
  return "";
}
