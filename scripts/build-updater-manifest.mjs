#!/usr/bin/env node
// Builds the Tauri updater `latest.json` manifest for the current release.
// Reads the .sig artifact produced by `tauri build --bundles app,dmg` and
// emits latest.json next to the bundle so it can be uploaded with the
// GitHub release.
//
// Usage: node scripts/build-updater-manifest.mjs <version>
//   <version>: e.g. v0.6.1 (with or without leading v)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const RELEASE_REPO = process.env.GIRAFFLE_RELEASE_REPO || "GiraffeGraph/giraffle";

function main() {
  const rawVersion = process.argv[2];
  if (!rawVersion) {
    console.error("usage: build-updater-manifest.mjs <version>");
    process.exit(1);
  }
  const version = rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`;
  const versionPlain = version.replace(/^v/, "");

  const platforms = {};

  const macosBundleDir = join(repoRoot, "src-tauri/target/release/bundle/macos");
  const macosArm64 = collectMacos(macosBundleDir, "aarch64", versionPlain, version);
  if (macosArm64) platforms["darwin-aarch64"] = macosArm64;

  if (Object.keys(platforms).length === 0) {
    console.error("no platform updater artifacts found; did you build with --bundles app,dmg?");
    process.exit(1);
  }

  const manifest = {
    version,
    notes: process.env.GIRAFFLE_RELEASE_NOTES || `Release ${version}`,
    pub_date: new Date().toISOString(),
    platforms,
  };

  const outPath = join(macosBundleDir, "latest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`wrote ${outPath}`);
  console.log(JSON.stringify(manifest, null, 2));
}

function collectMacos(bundleDir, arch, versionPlain, version) {
  const candidates = [
    `Giraffle.app.tar.gz`,
    `Giraffle_${versionPlain}_${arch}.app.tar.gz`,
  ];
  let archivePath = null;
  for (const name of candidates) {
    const p = join(bundleDir, name);
    if (existsSync(p)) {
      archivePath = p;
      break;
    }
  }
  if (!archivePath) return null;
  const sigPath = `${archivePath}.sig`;
  if (!existsSync(sigPath)) {
    console.error(`signature missing for ${archivePath}; expected ${sigPath}`);
    return null;
  }
  const signature = readFileSync(sigPath, "utf8").trim();
  const fileName = archivePath.split("/").pop();
  return {
    signature,
    url: `https://github.com/${RELEASE_REPO}/releases/download/${version}/${fileName}`,
  };
}

main();
