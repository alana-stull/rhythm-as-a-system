"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const menubar_1 = require("menubar");
const isDev = process.env.NODE_ENV !== "production";
const DASHBOARD_URL = "http://localhost:5173";
electron_1.app.whenReady().then(() => {
    const iconPath = path.join(__dirname, "..", "assets", "tray-iconTemplate.png");
    const icon = electron_1.nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
    const index = isDev
        ? "http://localhost:5174"
        : `file://${path.join(__dirname, "../dist/index.html")}`;
    const mb = (0, menubar_1.menubar)({
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
            electron_1.shell.openExternal(DASHBOARD_URL);
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    // Keep alive in menu bar — do not quit
});
