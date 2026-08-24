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

import { BrowserWindow, session, shell } from "electron";
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

  // 포털이 새 창으로 여는 보고서·미리보기도 같은 세션에서 열리게 둡니다.
  portalWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

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
