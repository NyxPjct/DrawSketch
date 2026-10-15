const { app, BrowserWindow, protocol, net, Menu } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "studio",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
if (process.env.DRAWSKETCH_DATA_DIR)
  app.setPath("userData", process.env.DRAWSKETCH_DATA_DIR);

function openStudio() {
  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: "#0c0c0c",
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), "dist/icons/icon-512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).protocol !== "studio:") event.preventDefault();
  });
  window.loadURL("studio://drawsketch/index.html");
  return window;
}
app.whenReady().then(() => {
  const root = path.join(app.getAppPath(), "dist");
  protocol.handle("studio", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "drawsketch")
      return new Response("Not found", { status: 404 });
    const relative =
      decodeURIComponent(url.pathname) === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname).replace(/^\//, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep))
      return new Response("Not found", { status: 404 });
    try {
      const result = await net.fetch(pathToFileURL(file).toString()),
        headers = new Headers(result.headers);
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'",
      );
      return new Response(result.body, { status: result.status, headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  Menu.setApplicationMenu(null);
  app.on("web-contents-created", (_event, contents) =>
    contents.session.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    ),
  );
  openStudio();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) openStudio();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
