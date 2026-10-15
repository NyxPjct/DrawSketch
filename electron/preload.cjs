const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld(
  "drawsketchDesktop",
  Object.freeze({ platform: process.platform }),
);
