import { app, nativeImage, shell } from "electron";
import * as path from "path";
import { menubar } from "menubar";

const isDev = process.env.NODE_ENV !== "production";

const DASHBOARD_URL = "http://localhost:5173";

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "..", "assets", "tray-iconTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  const index = isDev
    ? "http://localhost:5174"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  const mb = menubar({
    index,
    icon,
    browserWindow: {
      width: 320,
      height: 280,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
    preloadWindow: true,
    showDockIcon: false,
    tooltip: "Rhythm",
  });

  mb.on("ready", () => {
    // In dev, open devtools
    if (isDev) {
      mb.window?.webContents.openDevTools({ mode: "detach" });
    }
  });

  // Listen for request to open dashboard
  mb.app.on("open-url", (_e, url) => {
    if (url === "rhythm://open-dashboard") {
      shell.openExternal(DASHBOARD_URL);
    }
  });
});

app.on("window-all-closed", () => {
  // Keep alive in menu bar — do not quit
});
