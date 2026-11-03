import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatKst } from "./format";
import { drawTextRun, measureText } from "./pdf-text";

// 평가 증빙용 「교육 실시 대장(참석자 명부)」 PDF.
// 매뉴얼 필수사항: 교육일자, 교육방법, 강사명, 교육내용, 참석자명(서명).

export type RegisterRow = {
  name: string;
  dept: string | null;
  completedAt: string;
  certNo: string;
  source: string; // web | app | admin
  signature: Uint8Array | null;
};

export type RegisterData = {
  orgName: string;
  course: { name: string; method: string | null; instructor: string | null; content: string | null };
  rows: RegisterRow[];
  missing: { name: string; dept: string | null }[];
  logs: { name: string; originalTime: string; newTime: string; reason: string; editedAt: string }[];
  printedAt: string;
};

const SOURCE_LABEL: Record<string, string> = { app: "앱 서명", web: "홈페이지", admin: "관리자 처리" };

function loadFont(file: string) {
  return readFileSync(path.join(process.cwd(), "src/assets/fonts", file));
}

// 폭에 맞춰 글자 단위로 줄바꿈 (한국어는 띄어쓰기 단위보다 글자 단위가 자연스럽다)
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of para) {
      if (measureText(line + ch, font, size) > width && line) {
        lines.push(line.trimEnd());
        line = ch === " " ? "" : ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

export async function buildRegisterPdf(d: RegisterData) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bold = await doc.embedFont(loadFont("NotoSansKR-Bold-subset.ttf"), { subset: false });
  const regular = await doc.embedFont(loadFont("NotoSansKR-Regular-subset.ttf"), { subset: false });
  const ink = rgb(0.12, 0.15, 0.13);
  const soft = rgb(0.42, 0.46, 0.44);
  const line = rgb(0.55, 0.58, 0.56);
  const head = rgb(0.9, 0.94, 0.92);

  const W = 595, H = 842, M = 40;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const pages: PDFPage[] = [page];

  function newPage() {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
  }
  function ensure(h: number) {
    if (y - h < M + 20) newPage();
  }
  function text(t: string, x: number, yy: number, size = 9.5, font = regular, color = ink) {
    drawTextRun(page, t, x, yy, font, size, color);
  }
  // 숫자와 영문 대문자가 섞인 한 덩어리(수료번호)는 일부 뷰어가 글자 간격을 벌려 그리므로 한 글자씩 놓는다.
  function chars(t: string, x: number, yy: number, size: number) {
    let cx = x;
    for (const ch of t) {
      page.drawText(ch, { x: cx, y: yy, size, font: regular, color: ink });
      cx += regular.widthOfTextAtSize(ch, size);
    }
  }
  function box(x: number, yy: number, w: number, h: number, fill?: typeof head) {
    page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: line, borderWidth: 0.6, color: fill });
  }

  // 제목
  const title = "교육 실시 대장 (참석자 명부)";
  text(title, (W - measureText(title, bold, 17)) / 2, y - 18, 17, bold);
  y -= 40;
  text(d.orgName, M, y, 10, bold);
  const pr = `출력 ${formatKst(d.printedAt)}`;
  text(pr, W - M - measureText(pr, regular, 9), y, 9, regular, soft);
  y -= 12;

  // 교육 정보
  const dates = d.rows.map((r) => r.completedAt).sort();
  const period = dates.length
    ? `${formatKst(dates[0]).slice(0, 10)} ~ ${formatKst(dates[dates.length - 1]).slice(0, 10)}`
    : "(이수자 없음)";
  const info: [string, string][] = [
    ["교육명", d.course.name],
    ["교육일자", period],
    ["교육방법", d.course.method || "(미입력)"],
    ["강사명", d.course.instructor || "(미입력)"],
    ["교육내용", d.course.content || "(미입력)"],
    ["참석 인원", `${d.rows.length}명 이수 · ${d.missing.length}명 미이수`],
  ];
  const LW = 80, VW = W - 2 * M - LW;
  for (const [k, v] of info) {
    const lines = wrap(v, regular, 9.5, VW - 14);
    const h = Math.max(22, lines.length * 13 + 9);
    ensure(h);
    box(M, y - h, LW, h, head);
    box(M + LW, y - h, VW, h);
    text(k, M + 8, y - 15, 9.5, bold);
    lines.forEach((l, i) => text(l, M + LW + 7, y - 15 - i * 13));
    y -= h;
  }
  y -= 18;

  // 참석자 표
  const cols: [string, number][] = [["번호", 30], ["성명", 70], ["부서", 62], ["이수일시", 92], ["이수방법", 58], ["수료번호", 83], ["서명", 120]];
  const rowH = 38;
  function tableHead() {
    ensure(22 + rowH);
    let x = M;
    for (const [label, w] of cols) {
      box(x, y - 20, w, 20, head);
      text(label, x + (w - measureText(label, bold, 9)) / 2, y - 14, 9, bold);
      x += w;
    }
    y -= 20;
  }
  text("참석자 (이수자)", M, y, 11, bold);
  y -= 10;
  tableHead();
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    if (y - rowH < M + 20) { newPage(); tableHead(); }
    const cells = [String(i + 1), r.name, r.dept ?? "-", formatKst(r.completedAt), SOURCE_LABEL[r.source] ?? r.source, r.certNo];
    let x = M;
    cols.forEach(([, w], ci) => {
      box(x, y - rowH, w, rowH);
      if (ci < cells.length) {
        const t = cells[ci];
        const size = measureText(t, regular, 9) > w - 6 ? 7.5 : 9;
        const tx = x + (w - measureText(t, regular, size)) / 2;
        if (ci === 5) chars(t, tx, y - rowH / 2 - 3, size);
        else text(t, tx, y - rowH / 2 - 3, size);
      }
      x += w;
    });
    const sigX = M + cols.slice(0, 6).reduce((a, [, w]) => a + w, 0);
    if (r.signature) {
      const img = await doc.embedPng(r.signature);
      const h = rowH - 6;
      const w = Math.min(cols[6][1] - 8, (img.width / img.height) * h);
      page.drawImage(img, { x: sigX + (cols[6][1] - w) / 2, y: y - rowH + 3, width: w, height: h });
    } else {
      const t = r.source === "app" ? "" : "(서명 없음)";
      text(t, sigX + (cols[6][1] - measureText(t, regular, 8)) / 2, y - rowH / 2 - 3, 8, regular, soft);
    }
    y -= rowH;
  }
  if (!d.rows.length) { ensure(20); text("이수자가 없습니다.", M + 6, y - 14, 9, regular, soft); y -= 20; }
  y -= 18;

  // 미이수자
  ensure(40);
  text(`미이수자 (${d.missing.length}명)`, M, y, 11, bold);
  y -= 16;
  const missingText = d.missing.length ? d.missing.map((m) => (m.dept ? `${m.name}(${m.dept})` : m.name)).join(", ") : "없음";
  for (const l of wrap(missingText, regular, 9.5, W - 2 * M)) { ensure(14); text(l, M, y); y -= 14; }
  y -= 12;

  // 수정 이력
  if (d.logs.length) {
    ensure(40);
    text("이수 시각 수정 이력 (관리자)", M, y, 11, bold);
    y -= 16;
    for (const g of d.logs) {
      const t = `${g.name}: ${formatKst(g.originalTime)} → ${formatKst(g.newTime)} · 사유: ${g.reason} · 수정 ${formatKst(g.editedAt)}`;
      for (const l of wrap(t, regular, 9, W - 2 * M)) { ensure(13); text(l, M, y, 9); y -= 13; }
    }
  }

  // 쪽 번호·출처
  pages.forEach((p, i) => {
    const foot = `osamcare.com 종사자 교육 시스템 기록 · ${i + 1} / ${pages.length}`;
    drawTextRun(p, foot, (W - measureText(foot, regular, 8)) / 2, 22, regular, 8, soft);
  });
  return doc.save();
}
