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
});
