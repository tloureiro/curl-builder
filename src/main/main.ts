import { app, BrowserWindow } from "electron";
import path from "node:path";
import { initConfig } from "./configManager";
import { registerIpcHandlers } from "./ipc";
import { rendererURL, isRendererURL } from "./rendererPolicy";
import { configureStorage } from "./storage";

const preloadPath = path.join(__dirname, "../preload/preload.js");
let win: BrowserWindow | null = null;
const indexPath = path.join(__dirname, "../renderer/index.html");
const trustedURL = rendererURL(indexPath, process.env.VITE_DEV_SERVER_URL);

async function createWindow() {
  configureStorage(process.env.CURL_BUILDER_DATA_DIR || app.getPath("userData"));
  // The renderer reports a failed read and offers retry without resetting data.
  // Keep the window available even when the local config needs repair.
  await initConfig().catch(() => {});

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      partition: "curl-builder-ui",
    },
  });

  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-frame-navigate", (event) => event.preventDefault());
  win.webContents.on("will-redirect", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) await win.loadURL(trustedURL);
  else await win.loadFile(indexPath);
}

app.whenReady().then(() => {
  // Register once; reactivating a closed window must not duplicate IPC handlers.
  registerIpcHandlers((event) => !!win && !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame && isRendererURL(event.senderFrame.url, trustedURL));
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });

  app.on("browser-window-created", (_event, window) => {
    window.webContents.on("before-input-event", (event, input) => {
      if (!input.control && !input.meta) return;
      const target = window.webContents;
      const key = input.key.toLowerCase();
      if (key === "+" || (key === "=" && input.shift)) {
        const level = target.getZoomLevel();
        target.setZoomLevel(level + 0.5);
        event.preventDefault();
      } else if (key === "-" || key === "_") {
        const level = target.getZoomLevel();
        target.setZoomLevel(level - 0.5);
        event.preventDefault();
      } else if (key === "0") {
        target.setZoomLevel(0);
        event.preventDefault();
      }
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
