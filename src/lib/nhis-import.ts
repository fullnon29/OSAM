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

// 국민건강보험공단 보도자료.

const BASE_URL = "https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do";

/**
 * 한 번에 살펴볼 보도자료 건수.
 *
 * 공단 목록은 기본이 한 쪽에 10건인데, 공단이 한 주에 10건 넘게 올리면
 * 다음 수집 전에 목록 첫 쪽에서 밀려나 영영 못 받습니다.
 * 50건이면 두 달 넘게 거슬러 보므로 하루 이틀 걸러도 놓치지 않습니다.
 */
const SCAN_COUNT = 50;

export async function fetchNhisArticles(): Promise<NewsArticle[]> {
  const html = await getHtml(
    `${BASE_URL}?mode=list&articleLimit=${SCAN_COUNT}&article.offset=0`
  );
  const $ = cheerio.load(html);

  const articles: NewsArticle[] = [];

  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const titleLink = $tr.find("td.a-l a.a-link");
    if (!titleLink.length) return;

    const href = titleLink.attr("href") || "";
    const articleNo = href.match(/articleNo=(\d+)/)?.[1];
    if (!articleNo) return;

    const title = titleLink.text().trim();
    if (!isRelevant(title)) return;

    const tds = $tr.find("> td");
    const date = normalizeDate($(tds[3]).text());
    if (!date || date < SINCE) return;

    const pdfHref = $tr.find("a.file-down-btn.pdf").attr("href") || "";
    const attachNo = pdfHref.match(/attachNo=(\d+)/)?.[1] ?? null;
    const sourceUrl = `${BASE_URL}?mode=view&articleNo=${articleNo}`;

    articles.push({
      source: "nhis",
      sourceId: articleNo,
      title,
      date,
      sourceUrl,
      loadBody: async () => {
        if (!attachNo) return { body: null };
        const body = await pdfText(
          `${BASE_URL}?mode=download&articleNo=${articleNo}&attachNo=${attachNo}`
        );
        return { body };
      },
    });
  });

  return articles;
}
