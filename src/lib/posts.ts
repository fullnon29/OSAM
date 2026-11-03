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

/**
 * 자동으로 받아 오는 곳.
 *
 * 관리자 화면에서 어느 기관 글인지 한눈에 보이게 합니다.
 * 여기 없는 source 는 사람이 직접 쓴 글로 봅니다.
 */
export const SOURCE_LABEL: Record<string, string> = {
  nhis: "공단",
  mohw: "복지부",
  ltc: "장기요양",
};

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

/** 글 번호를 고르게 흩뜨립니다(FNV-1a + 마무리 섞기). */
function hash(id: string) {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  n ^= n >>> 16;
  n = Math.imul(n, 2246822507);
  n ^= n >>> 13;
  n = Math.imul(n, 3266489909);
  return (n ^ (n >>> 16)) >>> 0;
}

/**
 * 날짜와 글 번호를 함께 써서 그림을 고릅니다.
 *
 * 무작위로 뽑으면 화면을 새로 고칠 때마다 바뀌어 어수선합니다.
 * 날짜만 쓰면 같은 날 올라온 글이 모두 같은 그림이 됩니다
 * (공단·복지부가 하루에 서너 건씩 내는 날이 있습니다).
 * 글 번호만 쓰면 열몇 건에서는 한쪽으로 몰립니다.
 * 둘을 더하면 날짜가 다른 글끼리도, 같은 날 글끼리도 갈립니다
 * — 실제 18건에서 옆칸과 같은 경우가 7회에서 3회로 줄었습니다.
 */
function pickImage(images: string[], publishedAt: string, id: string) {
  const day = Math.floor(Date.parse(publishedAt) / 86400000);
  const n = Number.isFinite(day) ? day + hash(id) : hash(id);
  return images[((n % images.length) + images.length) % images.length];
}

export function postThumbnail(
  post: Pick<Post, "id" | "thumbnail_url" | "category" | "published_at">
) {
  if (post.thumbnail_url) return post.thumbnail_url;
  const images =
    CATEGORY_FALLBACK_IMAGES[post.category] ?? CATEGORY_FALLBACK_IMAGES["센터 소식"];
  return pickImage(images, post.published_at, post.id);
}
