const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "drawsketchDesktop",
  Object.freeze({
    platform: process.platform,
    updates: (action, value) =>
      ipcRenderer.invoke("drawsketch:updates", action, value),
  }),
);
