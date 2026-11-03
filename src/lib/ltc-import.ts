import "server-only";
import * as cheerio from "cheerio";
import {
  getHtml,
  hwpText,
  normalizeDate,
  pdfText,
  SINCE,
  type NewsArticle,
} from "./news-common";

// 노인장기요양보험 누리집 법령자료실(고시 개정 안내).
//
// 같은 서버에 서식자료실(B0017)·통계자료(B0019)·복지용구(B0010)도 있지만
// 그쪽은 실무용 서식과 통계라 홈페이지 소식으로는 맞지 않아 넣지 않았습니다.
// 필요하시면 직원 화면 쪽 자료 모음으로 따로 붙이는 편이 낫습니다.

const ORIGIN = "https://www.longtermcare.or.kr";
const BOARD = `${ORIGIN}/npbs/cms/board/board/Board.jsp`;
const COMMUNITY_KEY = "B0018";

type Attachment = { name: string; href: string };

/** 붙임에서 가져올 글자 수. 고시 전문은 수만 자라 통째로 실으면 읽히지 않습니다. */
const ATTACH_LIMIT = 4000;

/**
 * 붙임에서 읽을 파일 하나를 고릅니다.
 *
 * 「개정문」을 먼저 봅니다. 바뀐 대목만 적혀 있어 소식으로 읽기 좋습니다.
 * 「전문」은 법 전체라 품목표·지역 목록이 수만 자씩 붙습니다.
 * pdf 가 없는 글이 많아 hwp 도 받습니다.
 */
function chooseAttachment(files: Attachment[]) {
  const score = (f: Attachment) =>
    (f.name.includes("개정문") ? 2 : 0) + (/\.pdf\b/i.test(f.name) ? 1 : 0);
  return [...files].sort((a, b) => score(b) - score(a))[0];
}

async function readAttachment(file: Attachment) {
  const url = new URL(file.href, ORIGIN).href;
  return /\.pdf\b/i.test(file.name) ? pdfText(url) : hwpText(url);
}

async function loadDetail(boardId: string) {
  const html = await getHtml(
    `${BOARD}?communityKey=${COMMUNITY_KEY}&boardId=${boardId}&act=VIEW`
  );
  const $ = cheerio.load(html);

  // 이 자리표는 제목·작성자·첨부에도 똑같이 붙어 있습니다.
  // 첫 번째를 집으면 제목이 잡히므로, 가장 긴 것을 안내문으로 봅니다.
  let notice = "";
  $(".tongboard_view.fir_ch").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > notice.length) notice = t;
  });

  const files: Attachment[] = [];
  $("a[href*='Download.jsp']").each((_, a) => {
    const name = $(a).text().replace(/\s+/g, " ").trim();
    const href = $(a).attr("href");
    if (name && href) files.push({ name, href });
  });

  const chosen = files.length ? chooseAttachment(files) : null;
  const attached = chosen ? await readAttachment(chosen) : null;

  // 안내문에 '무엇이 바뀌었는지'가 적혀 있습니다. 거기까지가 소식으로 읽을 대목이고,
  // 고시 본문(품목 가격표·섬 지역 목록 등)은 참고자료라 앞부분만 붙이고 원문으로 넘깁니다.
  const body =
    attached && attached.length > ATTACH_LIMIT
      ? `${attached.slice(0, ATTACH_LIMIT).trimEnd()}\n\n…(이하 줄임)`
      : attached;

  if (notice && body) return `${notice}\n\n${body}`;
  return body || notice || null;
}

export async function fetchLtcArticles(): Promise<NewsArticle[]> {
  const html = await getHtml(`${BOARD}?communityKey=${COMMUNITY_KEY}&act=LIST`);
  const $ = cheerio.load(html);

  const articles: NewsArticle[] = [];

  $("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find("a[href*='act=VIEW']").first().attr("href") || "";
    const boardId = href.match(/boardId=(\d+)/)?.[1];
    if (!boardId) return;

    const tds = $tr.find("> td").map((_, td) => $(td).text().replace(/\s+/g, " ").trim()).get();
    // 번호(또는 '공지') · 제목 · 담당부서 · 등록일 차례입니다.
    const title = tds[1] || "";
    const date = normalizeDate(tds[3] || "");
    if (!title || !date || date < SINCE) return;

    // 이 게시판은 전부 장기요양 자료라 낱말로 거르지 않습니다.
    articles.push({
      source: "ltc",
      sourceId: boardId,
      title,
      date,
      sourceUrl: `${BOARD}?communityKey=${COMMUNITY_KEY}&boardId=${boardId}&act=VIEW`,
      loadBody: async () => ({ body: await loadDetail(boardId) }),
    });
  });

  return articles;
}
