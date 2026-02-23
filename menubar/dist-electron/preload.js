"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("rhythmBridge", {
    platform: process.platform,
    openDashboard: () => {
        electron_1.shell.openExternal("http://localhost:5173");
    },
});
