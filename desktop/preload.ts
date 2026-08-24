import { contextBridge, ipcRenderer } from "electron";

// 화면에는 파일 시스템을 직접 열어 주지 않고, 필요한 동작만 통로로 내줍니다.
contextBridge.exposeInMainWorld("osam", {
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  scanFolder: (dir: string) => ipcRenderer.invoke("scan-folder", dir),
  importFolder: (dir: string) => ipcRenderer.invoke("import-folder", dir),
  cancel: () => ipcRenderer.invoke("cancel"),
  onProgress: (cb: (p: unknown) => void) => {
    ipcRenderer.on("import-progress", (_e, payload) => cb(payload));
  },

  // 공단 포털에서 일지 받기
  chooseDownloadFolder: () => ipcRenderer.invoke("choose-download-folder"),
  openPortal: (saveDir: string) => ipcRenderer.invoke("open-portal", saveDir),
  clearPortalSession: () => ipcRenderer.invoke("clear-portal-session"),
  dumpPortal: (saveDir: string) => ipcRenderer.invoke("dump-portal", saveDir),
  onPortalDownload: (cb: (e: unknown) => void) => {
    ipcRenderer.on("portal-download", (_e, payload) => cb(payload));
  },
});
