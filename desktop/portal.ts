// 공단 포털에서 업무수행일지를 받아 오는 창.
//
// 로그인은 선생님이 직접 하십니다. 아이디·비밀번호·인증서는 이 프로그램이
// 저장하지도, 대신 입력하지도 않습니다. 간편인증·공동인증서는 애초에 자동화가
// 되지 않고, 되더라도 남의 손에 맡길 일이 아니기 때문입니다.
//
// 프로그램이 맡는 것은 손이 많이 가는 부분입니다.
//   - 내려받은 파일을 지정한 폴더(구글 드라이브 동기화 폴더)에 자동으로 저장
//   - 같은 파일을 두 번 받지 않도록 이름을 정리
//   - 받은 즉시 어르신을 알아내 연결 (본문에 성명과 인정번호가 있습니다)
//
// 로그인 상태는 창을 닫아도 유지됩니다(persist 세션). 매번 로그인하지 않아도
// 되도록 한 것이며, 저장되는 것은 브라우저 쿠키뿐입니다.

import { BrowserWindow, session } from "electron";
import { readFileSync } from "node:fs";
import { extractPdfText } from "../src/lib/documents/extract-text";
import {
  STEP_CLICK_PRINT,
  STEP_CLOSE,
  STEP_EXPORT_PDF,
  STEP_LIST_LOGS,
  STEP_PROBE,
  stepRecordReady,
  stepConfirmWarning,
  stepOpenLog,
  stepSelectRecipient,
} from "./portal-steps";

import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

/** 공단 장기요양기관 업무포털 */
export const PORTAL_URL = "https://longtermcare.or.kr";

const PARTITION = "persist:ltc-portal";

let portalWindow: BrowserWindow | null = null;

export type DownloadEvent =
  | { kind: "saved"; file: string; bytes: number }
  | { kind: "failed"; file: string; reason: string };

/** 파일 이름에 쓸 수 없는 글자를 걷어 냅니다. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "download";
}

/** 같은 이름이 있으면 뒤에 번호를 붙입니다. 덮어쓰지 않습니다. */
function uniquePath(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n++;
  }
  return candidate;
}

/**
 * 포털 창을 엽니다.
 *
 * @param saveDir 내려받은 파일을 둘 폴더. 구글 드라이브 동기화 폴더를 지정하면
 *                받는 즉시 드라이브에 올라갑니다.
 * @param onEvent 저장 결과를 화면에 알리는 통로
 */
/**
 * 포털이 새로 여는 창을 어떻게 다룰지 정합니다.
 *
 * 이 포털은 기록창·인쇄 미리보기를 새 창으로 띄우고, 그중에는 주소가
 * about:blank 인 빈 창도 있습니다(열어 놓고 내용을 채워 넣는 방식).
 * 그런 주소를 윈도우에 넘기면 "이 링크를 열려면 새 앱이 필요합니다" 창이
 * 뜹니다. 포털이 여는 창은 모두 우리가 같은 세션으로 열어 줍니다.
 *
 * 바깥 프로그램으로는 아무것도 넘기지 않습니다. 화면이 시키는 대로
 * 운영체제를 여는 것은 위험하기 때문입니다.
 */
function attachWindowBehavior(wc: Electron.WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    const isBlank = !url || url === "about:blank" || url.startsWith("about:");
    if (isBlank || url.startsWith("http://") || url.startsWith("https://")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 800,
          webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
        },
      };
    }
    // javascript:, ms-windows-store: 같은 것은 열지 않습니다.
    return { action: "deny" };
  });

  // 그렇게 열린 창이 또 창을 여는 경우가 있어 같은 규칙을 물려줍니다.
  wc.on("did-create-window", (child) => attachWindowBehavior(child.webContents));
}

export function openPortal(saveDir: string, onEvent: (e: DownloadEvent) => void): BrowserWindow {
  if (portalWindow && !portalWindow.isDestroyed()) {
    portalWindow.focus();
    return portalWindow;
  }

  mkdirSync(saveDir, { recursive: true });

  const ses = session.fromPartition(PARTITION);

  // 내려받기가 시작되면 저장 위치를 프로그램이 정합니다.
  // 창이 뜰 때마다 붙지 않도록 한 번만 겁니다.
  ses.removeAllListeners("will-download");
  ses.on("will-download", (_event, item) => {
    markDownloadInRecording(item.getURL());
    const name = safeName(item.getFilename());
    const target = uniquePath(saveDir, name);
    item.setSavePath(target);

    item.once("done", (_e, state) => {
      if (state === "completed") {
        onEvent({ kind: "saved", file: target, bytes: item.getReceivedBytes() });
        notifyDownload(target);
      } else {
        onEvent({ kind: "failed", file: name, reason: state });
        notifyDownload(null);
      }
    });
  });

  portalWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "공단 포털 — 업무수행일지 받기",
    webPreferences: {
      partition: PARTITION,
      // 포털 화면에는 우리 프로그램 기능을 일절 열어 주지 않습니다.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  attachWindowBehavior(portalWindow.webContents);

  portalWindow.on("closed", () => {
    portalWindow = null;
  });

  void portalWindow.loadURL(PORTAL_URL);
  return portalWindow;
}

/** 포털 창이 열려 있는지 */
export function isPortalOpen(): boolean {
  return !!portalWindow && !portalWindow.isDestroyed();
}

/** 포털 창과 그 창이 띄운 창들을 모두 닫습니다. */
export function closePortal(): void {
  const ses = session.fromPartition(PARTITION);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    if (win.webContents.session !== ses) continue;
    try {
      win.destroy();
    } catch {
      // 이미 닫혔으면 그만입니다.
    }
  }
  portalWindow = null;
}

/** 로그인 흔적을 지웁니다. 공용 컴퓨터에서 쓰신 뒤를 위한 것입니다. */
export async function clearPortalSession(): Promise<void> {
  const ses = session.fromPartition(PARTITION);
  await ses.clearStorageData();
}

/* ── 화면 구조 살펴보기 ────────────────────────────────────────
   자동화를 만들려면 단추와 표의 실제 이름(id·class)을 알아야 합니다.
   그런데 화면에는 어르신 163분의 성함과 인정번호가 떠 있습니다.
   그래서 뼈대만 뽑고 글자는 길이로만 남깁니다. 개인정보는 나가지 않습니다. */

/**
 * 화면 안에서 실행되어 구조만 추려 내는 코드.
 *
 * 이 포털은 Nexacro 로 만들어져 있습니다. 다행히 화면 요소의 DOM id 에
 * 구성요소 경로가 통째로 들어 있습니다.
 *   mainframe.VFrameSet.HFrameSet.VFrameSetSub.framesetWork.winNPS…form.btn_print
 * 그래서 id 만 모으면 깊이 제한 없이 전체 구조를 얻습니다. 모은 경로로
 * Nexacro 객체를 되짚어 종류(단추·표·입력칸)와 자료 묶음까지 알아냅니다.
 *
 * 값은 가립니다. 필요한 것은 '무엇이 있는지'이지 '무엇이 적혔는지'가 아닙니다.
 */
const DUMP_SCRIPT = `(() => {
 try {
  const redact = (s) => {
    if (typeof s !== "string") return "";
    const t = s.trim();
    if (!t) return "";
    if (/L\d{8,}/.test(t)) return "《인정번호》";
    if (/^[가-힣]{2,4}$/.test(t)) return "《이름》";
    if (/\d{4}[-.]\d{1,2}[-.]\d{1,2}/.test(t)) return "《날짜》";
    if (t.length > 30) return "《글자" + t.length + "》";
    return t;
  };

  // 1) 화면에 있는 구성요소 경로를 모두 모읍니다.
  const paths = [];
  const seen = {};
  document.querySelectorAll("[id]").forEach((el) => {
    const id = el.id;
    if (!id || id.indexOf("mainframe") !== 0) return;
    if (id.indexOf(":") >= 0) return;              // :icontext 같은 내부 조각
    if (/\.(hscrollbar|vscrollbar)(\.|$)/.test(id)) return;  // 스크롤바는 뺍니다
    if (seen[id]) return;
    seen[id] = 1;
    paths.push(id);
  });

  // 2) 경로로 Nexacro 객체를 되짚습니다.
  const app = (typeof nexacro !== "undefined" && nexacro.getApplication) ? nexacro.getApplication() : null;
  const resolve = (path) => {
    if (!app) return null;
    const parts = path.split(".");
    let cur = app;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur;
  };

  const components = [];
  const datasets = [];
  const functions = [];

  for (let i = 0; i < paths.length && i < 4000; i++) {
    const path = paths[i];
    const obj = resolve(path);
    const item = { path: path };
    if (obj) {
      item.type = obj._type_name || (obj.constructor && obj.constructor.name) || "?";
      if (typeof obj.text === "string" && obj.text) item.text = redact(obj.text);
      if (obj.visible === false) item.hidden = true;

      // 표(Grid)는 어느 자료 묶음을 보여 주는지가 중요합니다.
      if (item.type === "Grid" && obj.binddataset) item.binddataset = obj.binddataset;

      // 화면(form)이면 그 안의 자료 묶음과 기능 이름을 훑습니다.
      if (item.type === "Form" || /\.form$/.test(path)) {
        for (const key in obj) {
          try {
            const v = obj[key];
            if (!v) continue;
            if (v._type_name === "Dataset") {
              const cols = [];
              const n = v.getColCount ? v.getColCount() : 0;
              for (let c = 0; c < n; c++) cols.push(v.getColID(c));
              datasets.push({ form: path, name: key,
                rows: v.getRowCount ? v.getRowCount() : -1, cols: cols });
            } else if (typeof v === "function" && /^(fn_|f_|btn_|grd_|div_|cbo_|on)/.test(key)) {
              functions.push({ form: path, name: key });
            }
          } catch (e) { /* 읽지 못하는 것은 건너뜁니다 */ }
        }
      }
    }
    components.push(item);
  }

  return JSON.stringify({
    kind: "nexacro",
    url: location.href,
    title: document.title,
    counts: { components: components.length, datasets: datasets.length, functions: functions.length },
    components: components,
    datasets: datasets,
    functions: functions,
  });
 } catch (e) {
  return JSON.stringify({
    kind: "error", url: location.href, title: document.title,
    message: String((e && e.message) || e),
  });
 }
})()`;

export type StructureDump = { url: string; title: string; json: string };

/**
 * 지금 열려 있는 포털 창(그 안의 프레임 포함)의 구조를 뽑습니다.
 * 자동화를 만들 때 한 번만 쓰고, 만든 뒤에는 쓰지 않습니다.
 */
export async function dumpPortalStructure(): Promise<StructureDump[]> {
  if (!portalWindow || portalWindow.isDestroyed()) return [];

  const out: StructureDump[] = [];
  const windows = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.webContents.session === session.fromPartition(PARTITION)
  );

  for (const win of windows) {
    const frames = [win.webContents.mainFrame, ...win.webContents.mainFrame.framesInSubtree];
    for (const frame of frames) {
      try {
        const json = (await frame.executeJavaScript(DUMP_SCRIPT, true)) as string;
        const parsed = JSON.parse(json) as { url: string; title: string };
        out.push({ url: parsed.url, title: parsed.title, json });
      } catch (err) {
        // 왜 읽지 못했는지 남겨 둡니다. 빈 파일만 나오면 원인을 알 수 없습니다.
        out.push({
          url: frame.url,
          title: "(읽지 못함)",
          json: JSON.stringify({
            kind: "unreadable",
            url: frame.url,
            message: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    }
  }
  return out;
}

/* ── 동작 기록 ─────────────────────────────────────────────────
   단추를 흉내 내는 방식은 창이 여러 개 겹치는 이 화면에서 잘 깨집니다.
   대신 일지 1건을 손으로 받으실 때 오가는 요청을 적어 두면, 그 요청을
   어르신만 바꿔 되풀이할 수 있습니다.

   값은 남기지 않고 '어떤 이름의 값이 오갔는지'만 적습니다. 어르신 성함이나
   인정번호가 파일에 남지 않도록 하기 위함입니다. */

export type RequestNote = {
  at: string;
  method: string;
  /** 도메인과 경로만. 물음표 뒤 값은 이름만 남깁니다. */
  path: string;
  /** 주소에 붙어 있던 값의 이름들 */
  queryKeys: string[];
  /** 보낸 본문에 있던 값의 이름들 */
  bodyKeys: string[];
  /** 파일 내려받기로 이어진 요청인지 */
  isDownload?: boolean;
};

let recording = false;
let notes: RequestNote[] = [];

/** 값은 버리고 이름만 남깁니다. */
function keysOf(query: string): string[] {
  if (!query) return [];
  return [...new URLSearchParams(query).keys()];
}

function bodyKeys(details: Electron.OnBeforeRequestListenerDetails): string[] {
  const data = details.uploadData;
  if (!data?.length) return [];
  try {
    const text = data
      .map((d) => (d.bytes ? Buffer.from(d.bytes).toString("utf8") : ""))
      .join("")
      .slice(0, 20000);
    if (text.trim().startsWith("{")) return Object.keys(JSON.parse(text) as object);
    return [...new URLSearchParams(text).keys()];
  } catch {
    return ["(읽지 못함)"];
  }
}

/** 요청 기록을 시작합니다. 일지 1건을 손으로 받아 주시면 됩니다. */
export function startRecording(): void {
  const ses = session.fromPartition(PARTITION);
  notes = [];
  recording = true;

  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    if (recording) {
      try {
        const url = new URL(details.url);
        // 그림·글꼴·스타일은 자동화와 무관하니 적지 않습니다.
        if (!/\.(png|jpe?g|gif|svg|css|woff2?|ico)(\?|$)/i.test(url.pathname)) {
          notes.push({
            at: new Date().toISOString(),
            method: details.method,
            path: `${url.origin}${url.pathname}`,
            queryKeys: keysOf(url.search.replace(/^\?/, "")),
            bodyKeys: bodyKeys(details),
          });
        }
      } catch {
        /* 주소를 읽지 못하면 건너뜁니다. */
      }
    }
    callback({});
  });
}

/** 기록을 멈추고 결과를 돌려줍니다. */
export function stopRecording(): RequestNote[] {
  recording = false;
  const ses = session.fromPartition(PARTITION);
  ses.webRequest.onBeforeRequest(null);
  return notes;
}

export function isRecording(): boolean {
  return recording;
}

/** 파일 내려받기가 일어나면 그 자리에 표시를 남깁니다. */
export function markDownloadInRecording(url: string): void {
  if (!recording) return;
  try {
    const u = new URL(url);
    notes.push({
      at: new Date().toISOString(),
      method: "DOWNLOAD",
      path: `${u.origin}${u.pathname}`,
      queryKeys: keysOf(u.search.replace(/^\?/, "")),
      bodyKeys: [],
      isDownload: true,
    });
  } catch {
    /* 무시 */
  }
}

/* ── 자동 받기 ─────────────────────────────────────────────────
   걸음마다 결과를 확인하며 진행합니다. 어디서 멈췄는지 알 수 있어야
   고칠 수 있기 때문입니다. 한 건이라도 어긋나면 그 어르신은 건너뛰고
   다음으로 넘어가되, 무엇이 안 됐는지 남깁니다. */


export type AutoLog = { kind: "info" | "ok" | "warn" | "error"; text: string };
export type AutoResult = { saved: number; skipped: number; failed: number; stopped: boolean };

let stopRequested = false;
export function requestStop(): void {
  stopRequested = true;
}

/** 내려받기가 끝날 때까지 기다리기 위한 약속. */
let pendingDownload: { resolve: (file: string | null) => void; timer: NodeJS.Timeout } | null = null;

function waitForDownload(ms: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingDownload = null;
      resolve(null);
    }, ms);
    pendingDownload = { resolve, timer };
  });
}

/** will-download 에서 부릅니다. */
function notifyDownload(file: string | null): void {
  if (!pendingDownload) return;
  clearTimeout(pendingDownload.timer);
  const { resolve } = pendingDownload;
  pendingDownload = null;
  resolve(file);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 같은 로그인 세션에 속한 창들. */
function portalWindows(): BrowserWindow[] {
  const ses = session.fromPartition(PARTITION);
  return BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.webContents.session === ses
  );
}

/**
 * 일지 한 건을 끝낸 뒤, 그 사이에 새로 열린 창만 닫습니다.
 *
 * 기록창과 인쇄 뷰어가 쌓이면 걸음마다 훑을 창이 늘어 점점 느려지다가
 * 결국 멎습니다. 그렇다고 "처음 연 창만 남기고 닫기"로 하면 안 됩니다.
 * 업무포털은 바로가기로 새 창에 열리는 경우가 있어, 정작 화면이 든 창을
 * 없애 버리게 됩니다(실제로 그렇게 되어 첫 건 뒤로 전부 실패했습니다).
 *
 * 그래서 시작할 때 있던 창을 기억해 두고, 그 뒤에 생긴 것만 닫습니다.
 */
function closeWindowsOpenedAfter(baseline: Set<number>): number {
  let closed = 0;
  for (const win of portalWindows()) {
    if (baseline.has(win.id)) continue;
    try {
      win.destroy();
      closed++;
    } catch {
      // 이미 닫혔으면 그만입니다.
    }
  }
  return closed;
}

/** 지금 훑어야 할 창과 틀이 몇 개인지. 늘어나면 무언가 안 닫히고 있는 것입니다. */
function frameLoad(): { windows: number; frames: number } {
  const wins = portalWindows();
  let frames = 0;
  for (const w of wins) {
    try {
      frames += 1 + w.webContents.mainFrame.framesInSubtree.length;
    } catch {
      /* 무시 */
    }
  }
  return { windows: wins.length, frames };
}

export type StepResult = {
  ok?: boolean;
  reason?: string;
  done?: boolean;
  /** 화면을 가진 틀이 준 대답인지. 빈 틀의 오류가 진짜 원인을 덮지 않게 합니다. */
  hasReal?: boolean;
  /** 그 틀에 포털 화면 자체가 없었다는 표시 */
  noNexacro?: boolean;
  [k: string]: unknown;
};

/**
 * 걸음을 실행합니다.
 *
 * 포털은 기록창·인쇄 미리보기를 새 창이나 iframe 으로 띄웁니다. 첫 창만
 * 들여다보면 그 안에서 벌어지는 일을 놓칩니다. 그래서 같은 로그인 세션에
 * 속한 모든 창과 그 안의 모든 틀을 훑어, 먼저 성공하는 곳의 결과를 씁니다.
 *
 * 자료를 바꾸는 걸음도 안전합니다. 그 자료를 가진 곳에서만 성공하고
 * 나머지는 "찾지 못했습니다"로 그냥 지나가기 때문입니다.
 */
async function run(script: string): Promise<StepResult> {
  const windows = portalWindows();
  if (!windows.length) return { ok: false, reason: "포털 창이 열려 있지 않습니다." };

  let last: StepResult = { ok: false, reason: "실행할 틀을 찾지 못했습니다." };

  // 한 틀이 멎으면 통째로 얼어붙으므로 기다리는 시간을 정해 둡니다.
  const withTimeout = (p: Promise<unknown>, ms: number) =>
    Promise.race([
      p,
      new Promise((_r, reject) => setTimeout(() => reject(new Error("응답이 없어 넘어감")), ms)),
    ]);

  for (const win of windows) {
    if (win.isDestroyed()) continue;
    const frames = [win.webContents.mainFrame, ...win.webContents.mainFrame.framesInSubtree];
    for (const frame of frames) {
      // 빈 창은 볼 것이 없습니다.
      if (!frame.url || frame.url === "about:blank") continue;
      try {
        const json = (await withTimeout(frame.executeJavaScript(script, true), 4000)) as string;
        const parsed = JSON.parse(json) as StepResult;
        if (parsed.ok) return parsed;
        // 화면이 없는 틀의 대답은 진짜 원인이 아닙니다. 남길 것이 없을 때만 씁니다.
        if (parsed.noNexacro) {
          if (!last.hasReal) last = parsed;
          continue;
        }
        // 화면을 가진 틀이 준 대답이라 쓸모가 있습니다. 이것을 남깁니다.
        last = { ...parsed, hasReal: true };
      } catch (err) {
        // nexacro 가 없는 틀(빈 창·인쇄 뷰어 등)입니다. 이런 오류가 진짜 원인을
        // 덮어쓰면 무엇이 잘못됐는지 알 수 없게 되므로, 남길 것이 없을 때만 씁니다.
        const message = err instanceof Error ? err.message : String(err);
        if (!last.hasReal) last = { ok: false, reason: message };
      }
    }
  }
  return last;
}

/**
 * 걸음 하나를 포털 창에서 실행합니다.
 *
 * RFID 전송내역 쪽(rfid.ts)도 같은 통로를 씁니다. 창을 찾고 틀을 훑는
 * 규칙을 두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽이 안 되기 때문입니다.
 */
export function runStep(script: string): Promise<StepResult> {
  return run(script);
}

/**
 * 받은 파일이 정말 채워진 일지인지 봅니다.
 *
 * 자료가 채워지기 전에 인쇄하면 빈 서식이 그대로 내려옵니다. 겉보기에는
 * 성공이라 그대로 두면 빈 종이 94장을 받고도 모르게 됩니다. 인정번호가
 * 들어 있는지로 판단합니다.
 */
async function looksFilled(file: string): Promise<{ filled: boolean; ltcNo: string | null }> {
  try {
    const { text } = await extractPdfText(readFileSync(file));
    const m = text.match(/L\d{10}/);
    return { filled: !!m, ltcNo: m ? m[0] : null };
  } catch {
    // 읽지 못하면 판단하지 않습니다. 받은 파일은 그대로 둡니다.
    return { filled: true, ltcNo: null };
  }
}

/**
 * 일지를 받아 옵니다.
 *
 * @param onlyOne 한 건만 받아 보고 멈춥니다. 처음 쓰실 때 확인용입니다.
 * @param reason  개인정보 열람 사유. 공단에 그대로 기록됩니다.
 */
export async function runAutomation(
  onlyOne: boolean,
  reason: string,
  onLog: (log: AutoLog) => void
): Promise<AutoResult> {
  stopRequested = false;
  const result: AutoResult = { saved: 0, skipped: 0, failed: 0, stopped: false };

  // 시작할 때 열려 있던 창들. 이 뒤에 생긴 창만 정리 대상입니다.
  const baseline = new Set(portalWindows().map((w) => w.id));

  // 같은 이유로 계속 실패하면 멈춥니다. 화면을 잃은 채로 94명을 헛도는 것은
  // 시간만 버리고 기록만 지저분해집니다.
  let consecutiveFailures = 0;
  const giveUpAfter = 3;

  const probe = await run(STEP_PROBE);
  if (!probe.ok) {
    onLog({ kind: "error", text: String(probe.reason) });
    return result;
  }
  const total = Number(probe.recipients ?? 0);
  onLog({ kind: "info", text: `어르신 ${total}명이 목록에 있습니다.` });

  for (let i = 0; i < total; i++) {
    if (stopRequested) {
      result.stopped = true;
      onLog({ kind: "warn", text: "중지했습니다." });
      break;
    }

    const pick = await run(stepSelectRecipient(i));
    if (pick.done) break;
    if (!pick.ok) {
      result.failed++;
      consecutiveFailures++;
      onLog({ kind: "error", text: `${i + 1}번째 어르신을 고르지 못했습니다: ${pick.reason}` });
      if (consecutiveFailures >= giveUpAfter) {
        onLog({
          kind: "error",
          text:
            `같은 이유로 ${giveUpAfter}번 잇달아 실패해 멈춥니다. ` +
            "포털 화면이 닫혔거나 로그인이 풀렸는지 확인해 주십시오.",
        });
        result.stopped = true;
        break;
      }
      continue;
    }
    consecutiveFailures = 0;
    await wait(700);

    const logs = await run(STEP_LIST_LOGS);
    const rows = (logs.rows as { i: number; wrtDt: string; status: string }[]) ?? [];
    if (!logs.ok || !rows.length) {
      result.skipped++;
      onLog({ kind: "info", text: `${i + 1}/${total} · 일지가 없어 건너뜁니다.` });
      continue;
    }

    for (const row of rows) {
      if (stopRequested) break;

      // 앞 건의 창이 남아 있으면 그 내용이 그대로 인쇄됩니다. 먼저 닫습니다.
      await run(STEP_CLOSE);
      await wait(400);

      const open = await run(stepOpenLog(row.i));
      if (!open.ok) {
        result.failed++;
        onLog({ kind: "error", text: `${i + 1}/${total} · 일지를 열지 못했습니다: ${open.reason}` });
        if (onlyOne) return result;
        continue;
      }
      // 창은 곧바로 뜨지만 내용은 서버에서 따로 받아 옵니다. 그 전에 인쇄하면
      // 빈 서식이 그대로 나옵니다. 자료가 들어찰 때까지 기다립니다.
      let ready = false;
      let lastCheck: StepResult = {};
      for (let tries = 0; tries < 16; tries++) {
        await wait(500);
        lastCheck = await run(stepRecordReady(String(pick.ltcNo ?? "")));
        if (lastCheck.ok) {
          ready = true;
          break;
        }
      }
      if (!ready) {
        result.failed++;
        onLog({
          kind: "error",
          text:
            `${i + 1}/${total} · ${lastCheck.reason ?? "기록창을 확인하지 못했습니다"} — 건너뜁니다.`,
        });
        // 무엇이 보였는지 남깁니다. 이유 없이 실패만 적히면 또 여쭤봐야 합니다.
        onLog({ kind: "info", text: `  채워진 칸 ${lastCheck.filledCount ?? 0}개` });
        for (const sample of (lastCheck.samples as Record<string, unknown>[]) ?? []) {
          onLog({ kind: "info", text: `  칸 ${JSON.stringify(sample)}` });
        }
        await run(STEP_CLOSE);
        closeWindowsOpenedAfter(baseline);
        if (onlyOne) return result;
        continue;
      }

      const print = await run(STEP_CLICK_PRINT);
      if (print.ok) onLog({ kind: "info", text: `「${print.pressed}」를 눌렀습니다.` });
      if (!print.ok) {
        result.failed++;
        onLog({ kind: "error", text: `${i + 1}/${total} · 양식 인쇄를 누르지 못했습니다: ${print.reason}` });
        await run(STEP_CLOSE);
        if (onlyOne) return result;
        continue;
      }
      await wait(900);

      const warn = await run(stepConfirmWarning(reason));
      const alerts = (warn.alerts as string[]) ?? [];
      for (const a of alerts) onLog({ kind: "warn", text: `포털 알림 — ${a}` });
      if (!warn.ok) {
        result.failed++;
        const opts = ((warn.options as string[]) ?? []).filter(Boolean);
        onLog({
          kind: "error",
          text:
            `${i + 1}/${total} · ${warn.reason}` +
            (opts.length ? ` (고를 수 있는 사유: ${opts.join(", ")})` : ""),
        });
        // 왜 못 읽었는지까지 남깁니다. 이유 없이 실패만 적히면 또 여쭤봐야 합니다.
        for (const note of (warn.combos as Record<string, unknown>[]) ?? []) {
          onLog({ kind: "info", text: `  칸 ${JSON.stringify(note)}` });
        }
        await run(STEP_CLOSE);
        closeWindowsOpenedAfter(baseline);
        if (onlyOne) return result;
        continue;
      }
      onLog({ kind: "info", text: `열람 사유 '${warn.recordedAs}' 로 기록됩니다.` });
      await wait(2500);

      const exported = await run(STEP_EXPORT_PDF);
      if (!exported.ok) {
        result.failed++;
        onLog({ kind: "error", text: `${i + 1}/${total} · PDF 를 내려받지 못했습니다: ${exported.reason}` });
        await run(STEP_CLOSE);
        if (onlyOne) return result;
        continue;
      }

      const file = await waitForDownload(30000);
      if (file) {
        const check = await looksFilled(file);
        if (check.filled) {
          result.saved++;
          onLog({ kind: "ok", text: `${i + 1}/${total} · ${row.wrtDt} 받음` });
        } else {
          result.failed++;
          onLog({
            kind: "error",
            text: `${i + 1}/${total} · ${row.wrtDt} 빈 서식이 내려왔습니다. 자료가 채워지기 전에 인쇄된 것입니다.`,
          });
        }
      } else {
        result.failed++;
        onLog({ kind: "warn", text: `${i + 1}/${total} · ${row.wrtDt} 내려받기를 기다렸지만 오지 않았습니다.` });
      }

      await run(STEP_CLOSE);
      await wait(600);

      // 닫히지 않고 남은 창을 치웁니다. 쌓이면 갈수록 느려집니다.
      const closed = closeWindowsOpenedAfter(baseline);
      const load = frameLoad();
      if (closed) onLog({ kind: "info", text: `남은 창 ${closed}개를 닫았습니다.` });
      if (load.frames > 12) {
        onLog({ kind: "warn", text: `훑을 틀이 ${load.frames}개로 늘었습니다 (창 ${load.windows}개).` });
      }

      if (onlyOne) {
        onLog({ kind: "info", text: "한 건만 시험했습니다. 결과를 확인해 주십시오." });
        return result;
      }
    }
  }

  return result;
}
