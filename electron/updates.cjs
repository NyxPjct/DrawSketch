const { ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function initUpdater(app) {
  const metadata = require(path.join(app.getAppPath(), "package.json"));
  const enabled =
    app.isPackaged &&
    metadata.drawsketchDistribution === "signed" &&
    ["win32", "darwin"].includes(process.platform);
  const preferencePath = path.join(
    app.getPath("userData"),
    "update-preferences.json",
  );
  let automatic = false;
  try {
    automatic =
      JSON.parse(fs.readFileSync(preferencePath, "utf8")).automatic === true;
  } catch {}
  let state = {
    state: enabled ? "idle" : "unavailable",
    version: app.getVersion(),
    automatic: enabled && automatic,
  };
  let updater,
    pending = false;
  if (enabled) {
    updater = require("electron-updater").autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on("checking-for-update", () => {
      state = { ...state, state: "checking" };
    });
    updater.on("update-available", (info) => {
      state = { ...state, state: "available", version: info.version };
    });
    updater.on("update-not-available", () => {
      state = { ...state, state: "current", version: app.getVersion() };
    });
    updater.on("download-progress", (progress) => {
      state = { ...state, state: "downloading", percent: progress.percent };
    });
    updater.on("update-downloaded", (info) => {
      state = { ...state, state: "downloaded", version: info.version };
    });
    updater.on("error", () => {
      state = { ...state, state: "error" };
    });
  }
  async function check() {
    if (
      !enabled ||
      pending ||
      ["checking", "downloading", "downloaded"].includes(state.state)
    )
      return;
    pending = true;
    try {
      await updater.checkForUpdates();
    } catch {
      state = { ...state, state: "error" };
    } finally {
      pending = false;
    }
  }
  ipcMain.handle("drawsketch:updates", async (event, action, value) => {
    // Only the studio's main frame may access this narrow API.
    if (
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url !== "studio://drawsketch/index.html"
    )
      throw new Error("Unauthorized update request");
    if (
      !["status", "check", "download", "install", "automatic"].includes(action)
    )
      throw new Error("Invalid update action");
    if (!enabled || action === "status") return { ...state };
    if (action === "automatic") {
      if (typeof value !== "boolean") throw new Error("Invalid preference");
      fs.mkdirSync(path.dirname(preferencePath), { recursive: true });
      fs.writeFileSync(preferencePath, JSON.stringify({ automatic: value }), {
        mode: 0o600,
      });
      state = { ...state, automatic: value };
    } else if (action === "check") {
      void check();
    } else if (
      action === "download" &&
      state.state === "available" &&
      !pending
    ) {
      pending = true;
      state = { ...state, state: "downloading", percent: 0 };
      updater
        .downloadUpdate()
        .catch(() => {
          state = { ...state, state: "error" };
        })
        .finally(() => {
          pending = false;
        });
    } else if (action === "install" && state.state === "downloaded") {
      setTimeout(() => updater.quitAndInstall(false, true), 200);
    }
    return { ...state };
  });
  if (enabled) {
    const startup = setTimeout(() => {
      if (state.automatic) void check();
    }, 30_000);
    const daily = setInterval(
      () => {
        if (state.automatic) void check();
      },
      24 * 60 * 60 * 1000,
    );
    startup.unref();
    daily.unref();
  }
};
