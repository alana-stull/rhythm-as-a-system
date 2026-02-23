import { contextBridge, shell } from "electron";

contextBridge.exposeInMainWorld("rhythmBridge", {
  platform: process.platform,
  openDashboard: () => {
    shell.openExternal("http://localhost:5173");
  },
});
