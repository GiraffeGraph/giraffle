const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// expo-sqlite ships its web engine as a WebAssembly asset.
config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];

// @giraffle/* packages are linked from the repo root and shipped as TypeScript
// source, so Metro has to watch and transpile them alongside the app.
config.watchFolders = [path.resolve(repoRoot, "packages")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Excalidraw publishes its stylesheet behind "development"/"production" export
// conditions that Metro does not set, so the build Giraffle ships is named here
// and the Canvas DOM component keeps importing the package's public specifier.
const EXCALIDRAW_STYLESHEET = "@excalidraw/excalidraw/index.css";
const excalidrawStylesheet = path.resolve(
  projectRoot,
  "node_modules/@excalidraw/excalidraw/dist/prod/index.css",
);

// lib0's React Native export reaches for `isomorphic-webcrypto`, which this app
// does not ship because Expo already exposes the same primitives natively.
const REACT_NATIVE_WEBCRYPTO = "isomorphic-webcrypto/src/react-native";
const webcryptoShim = path.resolve(projectRoot, "src/sync/reactNativeWebcrypto.ts");

// @sqlite.org/sqlite-wasm ships worker entry points for the OPFS-backed VFS
// variants. Giraffle runs SQLite in memory on the main thread and seals the
// database image itself, so those workers never start — but Metro follows the
// `new Worker(new URL(...))` call sites while bundling and would fail to
// resolve their bare specifiers, so they are pointed at an inert module.
const SQLITE_WASM_WORKERS = new Set([
  "sqlite3-worker1.mjs",
  "sqlite3-opfs-async-proxy.js",
]);
const unusedSqliteWorker = path.resolve(
  projectRoot,
  "src/infrastructure/database/unusedSqliteWorker.js",
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SQLITE_WASM_WORKERS.has(moduleName)) {
    return { type: "sourceFile", filePath: unusedSqliteWorker };
  }
  if (moduleName === EXCALIDRAW_STYLESHEET) {
    return { type: "sourceFile", filePath: excalidrawStylesheet };
  }
  if (moduleName === REACT_NATIVE_WEBCRYPTO) {
    return { type: "sourceFile", filePath: webcryptoShim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
