const { app, BrowserWindow, dialog, Menu, ipcMain, protocol, safeStorage, session, shell } = require("electron");
const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");
const { startHeadlessServer } = require("./headless-server.cjs");
const { createGoogleCalendarIntegration } = require("./google-calendar.cjs");

const SCHEME = "giraffle-app";
const APP_ORIGIN = `${SCHEME}://app`;
let quitting = false;
let headlessServer = null;
let googleCalendar = null;
let rendererSender = null;
const headlessQueue = [];
const pendingHeadless = new Map();
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

app.setName("Giraffle");

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function isApplicationUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === `${SCHEME}:` &&
      url.hostname === "app" &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

async function resolveAsset(webRoot, requestUrl) {
  if (!isApplicationUrl(requestUrl)) return null;
  const url = new URL(requestUrl);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const requested = path.resolve(webRoot, `.${pathname}`);
  if (!isInside(webRoot, requested)) return null;

  try {
    const info = await stat(requested);
    if (info.isFile()) return requested;
    if (info.isDirectory()) {
      const index = path.join(requested, "index.html");
      if ((await stat(index)).isFile()) return index;
    }
  } catch {
    // Expo Router paths render through the single exported app shell.
  }

  return path.extname(requested) ? null : path.join(webRoot, "index.html");
}

function installApplicationProtocol() {
  const webRoot = app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(__dirname, "..", "dist");

  protocol.handle(SCHEME, async (request) => {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const asset = await resolveAsset(webRoot, request.url);
    if (!asset) return new Response("Not found", { status: 404 });
    const body = await readFile(asset);
    return new Response(body, {
      headers: {
        "Content-Type": CONTENT_TYPES[path.extname(asset).toLowerCase()] ?? "application/octet-stream",
      },
    });
  });
}

function installMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ],
      },
    ]),
  );
}

function createWindow({ hidden = false } = {}) {
  const window = new BrowserWindow({
    title: "Giraffle",
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#191919",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => {
    if (!hidden) window.show();
  });

  // Keep the renderer (and its in-memory vault keys) alive when the macOS red
  // close button is used. Hiding still emits a background state, so the user's
  // configured lock timeout applies when the window is opened again.
  window.on("close", (event) => {
    if (process.platform !== "darwin" || quitting) return;
    event.preventDefault();
    window.hide();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isApplicationUrl(url)) {
      event.preventDefault();
      if (url.startsWith("https://")) void shell.openExternal(url);
    }
  });

  window.on("closed", () => {
    rendererSender = null;
    const response = { ok: false, error: { code: "RUNTIME_CLOSED", message: "Giraffle runtime closed before completing the command" } };
    for (const [id, pending] of pendingHeadless) pending.resolve({ id, ...response });
    pendingHeadless.clear();
    headlessQueue.length = 0;
  });

  void window.loadURL(`${APP_ORIGIN}/`).catch((cause) => {
    console.error("Could not load the desktop client", cause);
    app.quit();
  });
  return window;
}

function dispatchHeadless(request) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingHeadless.delete(request.id);
      resolve({ id: request.id, ok: false, error: { code: "TIMEOUT", message: "Giraffle runtime did not become ready" } });
    }, 25_000);
    pendingHeadless.set(request.id, {
      resolve: (response) => {
        clearTimeout(timer);
        resolve(response);
      },
    });
    const window = BrowserWindow.getAllWindows()[0] ?? createWindow({ hidden: true });
    if (window.isDestroyed()) {
      pendingHeadless.delete(request.id);
      clearTimeout(timer);
      resolve({ id: request.id, ok: false, error: { code: "RUNTIME_CLOSED", message: "Giraffle runtime is unavailable" } });
      return;
    }
    if (rendererSender && !rendererSender.isDestroyed()) rendererSender.send("giraffle-headless:request", request);
    else headlessQueue.push(request);
  });
}

ipcMain.on("giraffle-headless:ready", (event) => {
  rendererSender = event.sender;
  for (const request of headlessQueue.splice(0)) event.sender.send("giraffle-headless:request", request);
});

ipcMain.on("giraffle-headless:response", (event, response) => {
  if (event.sender !== rendererSender) return;
  const pending = pendingHeadless.get(response?.id);
  if (!pending) return;
  pendingHeadless.delete(response.id);
  pending.resolve(response);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  app.on("before-quit", () => {
    quitting = true;
    void headlessServer?.close().catch(() => undefined);
  });

  app.whenReady().then(() => {
    installApplicationProtocol();
    installMenu();
    googleCalendar = createGoogleCalendarIntegration({
      userData: app.getPath("userData"),
      safeStorage,
      openExternal: (url) => shell.openExternal(url),
    });
    ipcMain.handle("giraffle-google-calendar:status", () => googleCalendar.status());
    ipcMain.handle("giraffle-google-calendar:configure", async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: "Choose Google Desktop OAuth credentials",
        properties: ["openFile"],
        filters: [{ name: "Google OAuth JSON", extensions: ["json"] }],
      };
      const selection = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      if (selection.canceled || !selection.filePaths[0]) return { canceled: true, status: await googleCalendar.status() };
      const source = await readFile(selection.filePaths[0], "utf8");
      return { canceled: false, status: await googleCalendar.configureCredentialJson(source) };
    });
    ipcMain.handle("giraffle-google-calendar:connect", () => googleCalendar.connect());
    ipcMain.handle("giraffle-google-calendar:disconnect", () => googleCalendar.disconnect());
    ipcMain.handle("giraffle-google-calendar:request", (_event, request) => googleCalendar.request(request));
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (!isApplicationUrl(details.url)) {
        callback({});
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
        },
      });
    });
    createWindow({ hidden: process.argv.includes("--headless-service") && app.isPackaged });
    void startHeadlessServer({ userData: app.getPath("userData"), dispatch: dispatchHeadless })
      .then((server) => { headlessServer = server; })
      .catch((cause) => console.error("Could not start headless control socket", cause));

    app.on("activate", () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        createWindow();
        return;
      }
      window.show();
      window.focus();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
