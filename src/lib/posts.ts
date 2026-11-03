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
  source: string | null;
  source_url: string | null;
};

export const POST_CATEGORIES = ["센터 소식", "요양 정보", "건강 팁"] as const;

export function categoryTagClass(category: string) {
  if (category === "요양 정보") return "tag-info";
  if (category === "건강 팁") return "tag-tip";
  return "";
}

// 글에 사진을 따로 올리지 않았을 때 쓰는 그림(파스텔 수채).
// 「요양 정보」는 공단 보도자료가 자동으로 쌓여 글이 가장 많으므로 석 장을 둡니다.
// 한 장만 두면 목록 전체가 같은 그림으로 채워집니다.
const CATEGORY_FALLBACK_IMAGES: Record<string, string[]> = {
  "센터 소식": ["/news/center-news.svg"],
  "요양 정보": [
    "/news/care-info.svg",
    "/news/care-info-2.svg",
    "/news/care-info-3.svg",
  ],
  "건강 팁": ["/news/health-tip.svg"],
};

/**
 * 글이 올라온 날짜로 그림을 고릅니다.
 *
 * 무작위로 뽑으면 화면을 새로 고칠 때마다 그림이 바뀌어 어수선하고,
 * 글 번호(uuid)를 섞어 쓰면 열 건 남짓에서는 한쪽으로 몰립니다.
 * 날짜를 쓰면 글이 쌓이는 차례대로 그림이 돌아갑니다.
 */
function pickByDate(images: string[], publishedAt: string) {
  const day = Math.floor(Date.parse(publishedAt) / 86400000);
  if (!Number.isFinite(day)) return images[0];
  return images[((day % images.length) + images.length) % images.length];
}

export function postThumbnail(
  post: Pick<Post, "thumbnail_url" | "category" | "published_at">
) {
  if (post.thumbnail_url) return post.thumbnail_url;
  const images =
    CATEGORY_FALLBACK_IMAGES[post.category] ?? CATEGORY_FALLBACK_IMAGES["센터 소식"];
  return pickByDate(images, post.published_at);
}
