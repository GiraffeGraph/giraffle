import { readFile } from "node:fs/promises";

const expected = process.argv[2];
if (!expected) throw new Error("Usage: node scripts/verify-release-version.mjs <version>");

const manifests = ["package.json", "apps/app/package.json", "apps/app/desktop/package.json", "apps/cli/package.json"];
for (const path of manifests) {
  const manifest = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
  if (manifest.version !== expected) {
    throw new Error(`${path} has version ${manifest.version}; expected ${expected}`);
  }
}

const cliSource = await readFile(new URL("../apps/cli/src/cli.ts", import.meta.url), "utf8");
if (!cliSource.includes(`const VERSION = "${expected}";`)) {
  throw new Error(`apps/cli/src/cli.ts does not declare version ${expected}`);
}

console.log(`Release version ${expected} is consistent.`);
