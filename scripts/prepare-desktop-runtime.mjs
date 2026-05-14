#!/usr/bin/env node
// Builds the Next standalone output and stages every runtime artifact the
// Tauri shell needs at `src-tauri/runtime/`. Layout:
//
//   src-tauri/runtime/
//     node                       (Node.js binary for the current target)
//     bootstrap.mjs              (copy of scripts/desktop-bootstrap.mjs)
//     server/
//       server.js                (from .next/standalone)
//       .next/                   (standalone tree + static)
//       public/
//       prisma/schema.prisma + migrations/
//       node_modules/            (prisma CLI, @prisma/*, embedded-postgres, pg, ...)
//
// Triggered automatically by `tauri build` / `tauri dev` via beforeBuildCommand.
// Pass `--dev` to skip the production Next build (useful during iteration).

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const runtimeDir = join(repoRoot, "src-tauri", "runtime");
const serverDir = join(runtimeDir, "server");
const binariesDir = join(repoRoot, "src-tauri", "binaries");
const skipNextBuild = process.argv.includes("--dev");

function log(...args) {
  console.log("[prepare-desktop-runtime]", ...args);
}

function run(cmd, args, options = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
  }
}

function reset(target) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
}

function copyTree(from, to) {
  if (!existsSync(from)) {
    throw new Error(`expected path missing: ${from}`);
  }
  cpSync(from, to, { recursive: true, dereference: true });
}

function copyModule(name) {
  const src = join(repoRoot, "node_modules", name);
  if (!existsSync(src)) {
    log(`skip ${name} (not installed)`);
    return false;
  }
  const dest = join(serverDir, "node_modules", name);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  return true;
}

const PORTABLE_NODE_VERSION = process.env.GIRAFFLE_NODE_VERSION || "v22.20.0";

function nodeDistribution() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32" && arch === "x64") {
    return {
      archive: `node-${PORTABLE_NODE_VERSION}-win-x64.zip`,
      extract: "zip",
      binaryInArchive: `node-${PORTABLE_NODE_VERSION}-win-x64/node.exe`,
      destName: "node.exe",
    };
  }
  if (platform === "darwin" && arch === "arm64") {
    return {
      archive: `node-${PORTABLE_NODE_VERSION}-darwin-arm64.tar.gz`,
      extract: "tar",
      binaryInArchive: `node-${PORTABLE_NODE_VERSION}-darwin-arm64/bin/node`,
      destName: "node",
    };
  }
  if (platform === "darwin" && arch === "x64") {
    return {
      archive: `node-${PORTABLE_NODE_VERSION}-darwin-x64.tar.gz`,
      extract: "tar",
      binaryInArchive: `node-${PORTABLE_NODE_VERSION}-darwin-x64/bin/node`,
      destName: "node",
    };
  }
  if (platform === "linux" && arch === "x64") {
    return {
      archive: `node-${PORTABLE_NODE_VERSION}-linux-x64.tar.xz`,
      extract: "tar",
      binaryInArchive: `node-${PORTABLE_NODE_VERSION}-linux-x64/bin/node`,
      destName: "node",
    };
  }
  if (platform === "linux" && arch === "arm64") {
    return {
      archive: `node-${PORTABLE_NODE_VERSION}-linux-arm64.tar.xz`,
      extract: "tar",
      binaryInArchive: `node-${PORTABLE_NODE_VERSION}-linux-arm64/bin/node`,
      destName: "node",
    };
  }
  throw new Error(`Unsupported platform for portable node: ${platform}-${arch}`);
}

function nodeCacheDir() {
  return join(homedir(), ".cache", "giraffle-desktop-node", PORTABLE_NODE_VERSION);
}

function downloadPortableNode(dist) {
  const cacheDir = nodeCacheDir();
  mkdirSync(cacheDir, { recursive: true });
  const cachedBinary = join(cacheDir, dist.destName);
  if (existsSync(cachedBinary)) return cachedBinary;

  const url = `https://nodejs.org/dist/${PORTABLE_NODE_VERSION}/${dist.archive}`;
  const archivePath = join(cacheDir, dist.archive);
  log(`downloading portable Node from ${url}`);
  const dl = spawnSync("curl", ["-fsSL", "-o", archivePath, url], {
    stdio: "inherit",
  });
  if (dl.status !== 0) {
    throw new Error(`curl failed for ${url} (exit ${dl.status})`);
  }

  const extractDir = join(cacheDir, "extract");
  if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  if (dist.extract === "tar") {
    const ext = spawnSync("tar", ["-xf", archivePath, "-C", extractDir], {
      stdio: "inherit",
    });
    if (ext.status !== 0) {
      throw new Error(`tar failed (exit ${ext.status})`);
    }
  } else if (dist.extract === "zip") {
    const ext = spawnSync("unzip", ["-q", "-o", archivePath, "-d", extractDir], {
      stdio: "inherit",
    });
    if (ext.status !== 0) {
      throw new Error(`unzip failed (exit ${ext.status})`);
    }
  }

  const extracted = join(extractDir, dist.binaryInArchive);
  if (!existsSync(extracted)) {
    throw new Error(`extracted Node binary missing at ${extracted}`);
  }
  copyFileSync(extracted, cachedBinary);
  chmodSync(cachedBinary, 0o755);
  rmSync(extractDir, { recursive: true, force: true });
  rmSync(archivePath, { force: true });
  return cachedBinary;
}

function rustTargetTriple() {
  // Maps Node's platform/arch to the Rust target triple that Tauri appends to
  // externalBin entries. Keep this in sync with bundle.externalBin in
  // tauri.conf.json.
  const map = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "win32-x64": "x86_64-pc-windows-msvc",
  };
  const key = `${process.platform}-${process.arch}`;
  const triple = map[key];
  if (!triple) {
    throw new Error(`Unsupported target for externalBin: ${key}`);
  }
  return triple;
}

function ensureNodeBinary() {
  mkdirSync(binariesDir, { recursive: true });
  const dist = nodeDistribution();
  const triple = rustTargetTriple();
  const ext = dist.destName === "node.exe" ? ".exe" : "";
  const dest = join(binariesDir, `node-${triple}${ext}`);
  const overrideFromEnv = process.env.GIRAFFLE_DESKTOP_NODE;
  const source = overrideFromEnv && overrideFromEnv.trim().length > 0
    ? resolve(overrideFromEnv.trim())
    : downloadPortableNode(dist);
  if (!existsSync(source)) {
    throw new Error(`Node binary source missing: ${source}`);
  }
  log(`copy node binary: ${source} -> ${dest}`);
  copyFileSync(source, dest);
  if (process.platform !== "win32") {
    chmodSync(dest, 0o755);
  }
}

function nextBuild() {
  if (skipNextBuild) {
    log("--dev: skipping next build (expects .next/standalone to exist)");
    if (!existsSync(join(repoRoot, ".next", "standalone", "server.js"))) {
      log("WARNING: .next/standalone is missing; run `npm run build` first.");
    }
    return;
  }
  run("npx", ["--no-install", "next", "build"], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://build:build@127.0.0.1:5432/giraffle?schema=public",
      AUTH_SECRET: process.env.AUTH_SECRET || "build-time-placeholder-secret",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
}

function stageNextStandalone() {
  const standalone = join(repoRoot, ".next", "standalone");
  if (!existsSync(join(standalone, "server.js"))) {
    throw new Error("Missing .next/standalone/server.js. Run next build first.");
  }
  copyTree(standalone, serverDir);
  copyTree(join(repoRoot, ".next", "static"), join(serverDir, ".next", "static"));
  if (existsSync(join(repoRoot, "public"))) {
    copyTree(join(repoRoot, "public"), join(serverDir, "public"));
  }
}

function materialiseSymlinks(root) {
  // Walk the staged runtime tree and replace any symlink with a copy of its
  // resolved target. Tauri's bundler dies on symlinks that escape the resource
  // root, and @embedded-postgres rehydrates its dylibs as symlinks even after
  // npm install. Materialising once at build time is the simplest fix.
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        let target;
        try {
          target = realpathSync(full);
        } catch {
          log(`broken symlink removed: ${full}`);
          rmSync(full, { force: true });
          continue;
        }
        rmSync(full, { force: true });
        const tstat = lstatSync(target);
        if (tstat.isDirectory()) {
          cpSync(target, full, { recursive: true, dereference: true });
        } else {
          copyFileSync(target, full);
          try {
            chmodSync(full, tstat.mode & 0o777);
          } catch {}
        }
      } else if (stat.isDirectory()) {
        walk(full);
      }
    }
  }
  walk(root);
}

function pruneServerDir() {
  const drop = [
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.build.prod.yml",
    "docker-compose.prod.yml",
    "docker-compose.prod.secrets.yml",
    "docker-compose.proxy.yml",
    "eslint.config.mjs",
    "vitest.config.mts",
    "tsconfig.tsbuildinfo",
    "package-lock.json",
    "proxy.ts",
    "tsconfig.json",
    ".env.production",
    "tests",
    "scripts",
    "src",
    "next-env.d.ts",
    "next.config.ts",
  ];
  for (const entry of drop) {
    const target = join(serverDir, entry);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
}

function stagePrisma() {
  copyTree(join(repoRoot, "prisma"), join(serverDir, "prisma"));
  copyFileSync(
    join(repoRoot, "prisma.config.ts"),
    join(serverDir, "prisma.config.ts"),
  );
}

function stageBootstrap() {
  copyFileSync(
    join(repoRoot, "scripts", "desktop-bootstrap.mjs"),
    join(runtimeDir, "bootstrap.mjs"),
  );
}

function platformBinaryName() {
  switch (`${process.platform}-${process.arch}`) {
    case "darwin-arm64":
      return "@embedded-postgres/darwin-arm64";
    case "darwin-x64":
      return "@embedded-postgres/darwin-x64";
    case "linux-x64":
      return "@embedded-postgres/linux-x64";
    case "linux-arm64":
      return "@embedded-postgres/linux-arm64";
    case "win32-x64":
      return "@embedded-postgres/windows-x64";
    default:
      return null;
  }
}

function stageNodeModules() {
  const wanted = [
    "prisma",
    ".prisma",
    "@prisma/client",
    "@prisma/engines",
    "@prisma/adapter-pg",
    "@prisma/debug",
    "@prisma/get-platform",
    "@prisma/internals",
    "@prisma/fetch-engine",
    "@prisma/engines-version",
    "@prisma/generator-helper",
    "embedded-postgres",
    "async-exit-hook",
    "pg",
    "pg-pool",
    "pg-types",
    "pg-protocol",
    "pgpass",
    "pg-int8",
    "pg-cloudflare",
    "postgres-array",
    "postgres-bytea",
    "postgres-date",
    "postgres-interval",
    "split2",
    "buffer-writer",
    "packet-reader",
    "xtend",
    "dotenv",
  ];
  const platformPkg = platformBinaryName();
  if (platformPkg) wanted.push(platformPkg);

  for (const name of wanted) copyModule(name);

  const pkgJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  writeFileSync(
    join(serverDir, "package.json"),
    JSON.stringify(
      {
        name: pkgJson.name,
        version: pkgJson.version,
        type: pkgJson.type ?? "commonjs",
        private: true,
      },
      null,
      2,
    ),
  );
}

function summarise() {
  const totalSize = (() => {
    function walk(p) {
      let total = 0;
      const stat = statSync(p, { throwIfNoEntry: false });
      if (!stat) return 0;
      if (stat.isFile()) return stat.size;
      try {
        for (const entry of readdirSync(p)) {
          total += walk(join(p, entry));
        }
      } catch {}
      return total;
    }
    try {
      return walk(runtimeDir);
    } catch {
      return null;
    }
  })();
  log(`runtime staged at ${runtimeDir}` + (totalSize ? ` (~${(totalSize / 1024 / 1024).toFixed(1)} MB)` : ""));
}

function main() {
  reset(runtimeDir);
  mkdirSync(serverDir, { recursive: true });
  nextBuild();
  stageNextStandalone();
  pruneServerDir();
  stagePrisma();
  stageNodeModules();
  stageBootstrap();
  ensureNodeBinary();
  materialiseSymlinks(runtimeDir);
  summarise();
}

main();
