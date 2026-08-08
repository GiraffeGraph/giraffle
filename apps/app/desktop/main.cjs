const { app, BrowserWindow, Menu, net, protocol, session, shell } = require("electron");
const { stat } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "giraffle-app";
const APP_ORIGIN = `${SCHEME}://app`;
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
    return net.fetch(pathToFileURL(asset).toString());
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

function createWindow() {
  const window = new BrowserWindow({
    title: "Giraffle",
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#191919",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => window.show());

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

  void window.loadURL(`${APP_ORIGIN}/`).catch((cause) => {
    console.error("Could not load the desktop client", cause);
    app.quit();
  });
}

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

  app.whenReady().then(() => {
    installApplicationProtocol();
    installMenu();
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
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
