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
      } else {
        onEvent({ kind: "failed", file: name, reason: state });
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
 * 이 포털은 Nexacro 로 만들어져 있어, 화면 요소가 DOM 이 아니라 객체로
 * 관리됩니다. DOM 을 훑으면 스크롤바만 잔뜩 나오고 정작 단추와 표는
 * 너무 깊이 묻혀 있어 잡히지 않습니다. 그래서 Nexacro 에게 직접 묻습니다.
 *
 * 여기서도 값은 가립니다. 필요한 것은 '무엇이 있는지'이지 '무엇이 적혔는지'가
 * 아니기 때문입니다.
 */
const DUMP_SCRIPT = `(() => {
 try {
  const redact = (s) => {
    if (typeof s !== "string") return "";
    const t = s.trim();
    if (!t) return "";
    if (/L\d{8,}/.test(t)) return "《인정번호》";
    if (/^[가-힣]{2,4}$/.test(t)) return "《이름》";
    if (/\d{4}-\d{2}-\d{2}/.test(t)) return "《날짜》";
    if (t.length > 30) return "《글자" + t.length + "》";
    return t;
  };

  if (typeof nexacro === "undefined" || !nexacro.getApplication) {
    return JSON.stringify({ kind: "not-nexacro", url: location.href, title: document.title });
  }

  const app = nexacro.getApplication();

  // 화면에 놓인 요소를 훑습니다. 종류(단추·표·입력칸)와 이름만 담습니다.
  const walk = (c, depth) => {
    if (!c || depth > 8) return null;
    const node = {
      name: c.name || c.id || "(이름없음)",
      type: (c._type_name || (c.constructor && c.constructor.name) || "?"),
    };
    if (typeof c.text === "string" && c.text) node.text = redact(c.text);
    if (typeof c.value === "string" && c.value) node.value = redact(c.value);
    if (c.visible === false) node.hidden = true;

    const kids = [];
    if (c.components && c.components.length) {
      for (let i = 0; i < c.components.length; i++) {
        const k = walk(c.components[i], depth + 1);
        if (k) kids.push(k);
      }
    }
    if (c.form && c.form !== c) {
      const f = walk(c.form, depth + 1);
      if (f) kids.push(f);
    }
    if (kids.length) node.children = kids;
    return node;
  };

  // 화면이 가진 자료 묶음(Dataset)과 기능(function) 이름.
  // 자동화는 단추를 누르는 것보다 이 기능을 직접 부르는 쪽이 튼튼합니다.
  const describeForm = (form) => {
    const datasets = [];
    const functions = [];
    for (const key in form) {
      try {
        const v = form[key];
        if (!v) continue;
        if (v._type_name === "Dataset") {
          datasets.push({ name: key, rows: v.getRowCount ? v.getRowCount() : -1,
            cols: v.getColCount ? v.getColCount() : -1,
            colIds: (() => { const out=[]; const n = v.getColCount?v.getColCount():0;
              for (let i=0;i<n;i++) out.push(v.getColID(i)); return out; })() });
        } else if (typeof v === "function" && /^(fn_|btn_|div_|grd_).*/.test(key)) {
          functions.push(key);
        }
      } catch (e) { /* 읽지 못하는 것은 건너뜁니다 */ }
    }
    return { datasets, functions };
  };

  const frames = [];
  const collectFrames = (fs, depth) => {
    if (!fs || depth > 6) return;
    if (fs.form) {
      const info = { name: fs.name, url: fs.form.url || "" };
      try { Object.assign(info, describeForm(fs.form)); } catch (e) {}
      try { info.components = walk(fs.form, 0); } catch (e) {}
      frames.push(info);
    }
    const list = fs.frames || fs.components;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) collectFrames(list[i], depth + 1);
    }
  };
  collectFrames(app.mainframe, 0);

  return JSON.stringify({ kind: "nexacro", url: location.href, title: document.title, frames });
 } catch (e) {
  return JSON.stringify({
    kind: "error",
    url: location.href,
    title: document.title,
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
