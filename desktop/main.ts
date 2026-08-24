// 오샘 서류 정리 도구 (윈도우 프로그램).
//
// 웹으로는 할 수 없는 일만 맡습니다: 내 컴퓨터의 폴더를 통째로 훑어
// 수급자 서류를 읽고 올리는 일입니다(요구사항 11: 로컬 우선).
// 읽고 판별하고 올리는 과정은 웹앱·명령어 스크립트와 같은 코드를 씁니다.

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findDocuments, importDocuments } from "../src/lib/documents/import-runner";
import {
  clearPortalSession,
  dumpPortalStructure,
  isPortalOpen,
  isRecording,
  openPortal,
  startRecording,
  stopRecording,
} from "./portal";

let db: SupabaseClient | null = null;
let cancelRequested = false;

/**
 * 접속 정보는 프로그램에 넣지 않고 설정 파일에서 읽습니다.
 * 열쇠가 실행파일에 박혀 배포되면 회수할 수 없기 때문입니다.
 * 설치본은 settings.json 을, 개발 중에는 저장소의 .env.local 을 씁니다.
 */
function loadSettings(): { url: string; key: string } | null {
  const settingsFile = path.join(app.getPath("userData"), "settings.json");
  if (existsSync(settingsFile)) {
    const parsed = JSON.parse(readFileSync(settingsFile, "utf8"));
    if (parsed.url && parsed.key) return { url: parsed.url, key: parsed.key };
  }

  const envFile = path.join(process.cwd(), ".env.local");
  if (existsSync(envFile)) {
    const env = Object.fromEntries(
      readFileSync(envFile, "utf8").split("\n").map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
    );
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
      return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SECRET_KEY };
    }
  }
  return null;
}

function getDb(): SupabaseClient {
  if (db) return db;
  const settings = loadSettings();
  if (!settings) {
    throw new Error(
      `접속 설정을 찾을 수 없습니다.\n${path.join(app.getPath("userData"), "settings.json")} 파일에 ` +
        `{"url": "...", "key": "..."} 형태로 넣어 주세요.`
    );
  }
  db = createClient(settings.url, settings.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return db;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: "오샘 서류 정리 도구",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("choose-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "서류가 들어 있는 폴더를 선택하세요",
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("scan-folder", async (_e, dir: string) => {
  const files = await findDocuments(dir);
  return { count: files.length };
});

ipcMain.handle("cancel", () => {
  cancelRequested = true;
});

ipcMain.handle("import-folder", async (event, dir: string) => {
  cancelRequested = false;
  return importDocuments({
    dir,
    db: getDb(),
    shouldCancel: () => cancelRequested,
    onProgress: (p) => event.sender.send("import-progress", p),
  });
});

/* ── 공단 포털에서 일지 받기 ──────────────────────────────────
   로그인은 사람이 직접 합니다. 프로그램은 내려받은 파일을 지정한 폴더에
   저장하고, 그 폴더를 그대로 올려 어르신에 연결하는 일까지 맡습니다. */

ipcMain.handle("choose-download-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "받은 일지를 저장할 폴더 (구글 드라이브 동기화 폴더 권장)",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("open-portal", async (event, saveDir: string) => {
  openPortal(saveDir, (e) => event.sender.send("portal-download", e));
  return { open: true };
});

ipcMain.handle("portal-open?", () => isPortalOpen());

ipcMain.handle("clear-portal-session", async () => {
  await clearPortalSession();
  return { cleared: true };
});

/**
 * 포털 화면의 뼈대를 파일로 남깁니다.
 *
 * 자동화를 만들려면 단추와 표의 실제 이름이 필요한데, 화면에는 어르신
 * 성함과 인정번호가 함께 떠 있습니다. 글자는 길이로만 남기고 뼈대만 담습니다.
 */
ipcMain.handle("dump-portal", async (_e, saveDir: string) => {
  const dumps = await dumpPortalStructure();
  if (!dumps.length) return { saved: null, frames: 0 };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const target = path.join(saveDir, `화면구조-${stamp}.json`);
  writeFileSync(
    target,
    JSON.stringify(
      dumps.map((d) => ({ url: d.url, title: d.title, dom: JSON.parse(d.json).dom })),
      null,
      1
    ),
    "utf8"
  );
  return { saved: target, frames: dumps.length };
});

/**
 * 일지 1건을 손으로 받으실 때 오가는 요청을 적어 둡니다.
 *
 * 값은 남기지 않고 이름만 적습니다. 이 기록으로 자동 받기를 만든 뒤에는
 * 쓰지 않습니다.
 */
ipcMain.handle("record-start", () => {
  startRecording();
  return { recording: true };
});

ipcMain.handle("record-stop", (_e, saveDir: string) => {
  const notes = stopRecording();
  if (!notes.length) return { saved: null, count: 0 };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const target = path.join(saveDir, `동작기록-${stamp}.json`);
  writeFileSync(target, JSON.stringify(notes, null, 1), "utf8");
  return { saved: target, count: notes.length };
});

ipcMain.handle("record-state", () => isRecording());
