// 오샘 서류 정리 도구 (윈도우 프로그램).
//
// 웹으로는 할 수 없는 일만 맡습니다: 내 컴퓨터의 폴더를 통째로 훑어
// 수급자 서류를 읽고 올리는 일입니다(요구사항 11: 로컬 우선).
// 읽고 판별하고 올리는 과정은 웹앱·명령어 스크립트와 같은 코드를 씁니다.

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findDocuments, importDocuments } from "../src/lib/documents/import-runner";

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
