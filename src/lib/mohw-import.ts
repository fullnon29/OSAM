import "server-only";
import * as cheerio from "cheerio";
import {
  getHtml,
  isRelevant,
  normalizeDate,
  pdfText,
  SINCE,
  type NewsArticle,
} from "./news-common";

// 보건복지부 보도자료.
//
// 공지사항·자료실도 보았으나 공지사항은 채용·행사뿐이고 자료실은 연구보고서라
// 센터와 상관있는 글이 거의 없어 보도자료만 봅니다.

const ORIGIN = "https://www.mohw.go.kr";
const LIST_URL = `${ORIGIN}/board.es?mid=a10503000000&bid=0027`;

/** 목록 제목은 뒤가 ".." 로 잘려 있어, 상세 쪽의 meta 에서 온전한 제목을 가져옵니다. */
const TITLE_TAIL = /\s*<\s*보도자료\s*<\s*알림.*$/;

async function loadTitleAndBody(listNo: string) {
  const html = await getHtml(`${LIST_URL}&act=view&list_no=${listNo}`);
  const $ = cheerio.load(html);

  const metaTitle = ($('meta[name="title"]').attr("content") || "")
    .replace(TITLE_TAIL, "")
    .trim();

  // 복지부 보도자료는 쪽에 본문이 없고 붙임 파일에만 있습니다. hwpx 말고 pdf 를 고릅니다.
  let pdfHref: string | null = null;
  $("a[href*='boardDownload']").each((_, a) => {
    if (pdfHref) return;
    const row = $(a).closest("li,td,p,div").text();
    if (/\.pdf\b/i.test(row)) pdfHref = $(a).attr("href") || null;
  });

  const body = pdfHref ? await pdfText(new URL(pdfHref, ORIGIN).href) : null;
  return { metaTitle, body };
}

export async function fetchMohwArticles(): Promise<NewsArticle[]> {
  const html = await getHtml(LIST_URL);
  const $ = cheerio.load(html);

  const articles: NewsArticle[] = [];

  $("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find("a[href*='act=view']").first().attr("href") || "";
    const listNo = href.match(/list_no=(\d+)/)?.[1];
    if (!listNo) return;

    const tds = $tr.find("> td").map((_, td) => $(td).text().replace(/\s+/g, " ").trim()).get();
    // 번호 · 제목 · 담당부서 · 등록일 · 조회수 차례입니다.
    const listTitle = (tds[1] || "").replace(/^새글\s*/, "").trim();
    const date = normalizeDate(tds[3] || "");
    if (!date || date < SINCE) return;

    // 목록 제목은 잘려 있지만 거르는 데는 충분합니다. 온전한 제목은 새 글일 때만 받습니다.
    if (!isRelevant(listTitle)) return;

    articles.push({
      source: "mohw",
      sourceId: listNo,
      title: listTitle.replace(/\.\.$/, "").trim(),
      date,
      sourceUrl: `${LIST_URL}&act=view&list_no=${listNo}`,
      loadBody: async () => {
        const { metaTitle, body } = await loadTitleAndBody(listNo);
        return { body, title: metaTitle || undefined };
      },
    });
  });

  return articles;
}
