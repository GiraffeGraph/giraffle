import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GUARD_FILE = fileURLToPath(import.meta.url);
const SERVER_ROOT = resolve(dirname(GUARD_FILE), "..");
const CONTENT_KEY_PACKAGE = "@giraffle/sync";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function readPackage(path: string): Record<string, unknown> | null {
  try {
    if (!statSync(path).isFile()) return null;
  } catch {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function dependencyNames(manifest: Record<string, unknown>): string[] {
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap(
    (field) => Object.keys((manifest[field] ?? {}) as Record<string, string>),
  );
}

/**
 * `@giraffle/sync` owns the content key wrappers. A relay that could resolve it
 * would hold the means to decrypt what it stores, so reachability is the property
 * under test, not merely whether the code happens to import it today.
 */
describe("blind relay guarantees", () => {
  it("never references the content key package in server source", () => {
    const offenders = [
      ...sourceFiles(join(SERVER_ROOT, "src")),
      ...sourceFiles(join(SERVER_ROOT, "tests")),
    ]
      // This guard has to name the package it forbids.
      .filter((path) => path !== GUARD_FILE)
      .filter((path) => readFileSync(path, "utf8").includes(CONTENT_KEY_PACKAGE));

    expect(offenders).toEqual([]);
  });

  it("does not declare the content key package as a dependency", () => {
    const manifest = readPackage(join(SERVER_ROOT, "package.json"));
    expect(manifest).not.toBeNull();
    expect(dependencyNames(manifest!)).not.toContain(CONTENT_KEY_PACKAGE);
  });

  it("cannot reach the content key package anywhere in its dependency tree", () => {
    const modules = join(SERVER_ROOT, "node_modules");
    const rootManifest = readPackage(join(SERVER_ROOT, "package.json"));
    const queue = dependencyNames(rootManifest!);
    const visited = new Set<string>();

    while (queue.length > 0) {
      const name = queue.shift()!;
      expect(name).not.toBe(CONTENT_KEY_PACKAGE);
      if (visited.has(name)) continue;
      visited.add(name);

      const manifest = readPackage(join(modules, name, "package.json"));
      if (!manifest) continue;
      queue.push(...dependencyNames(manifest));
    }

    expect(visited.size).toBeGreaterThan(0);
    expect(visited).not.toContain(CONTENT_KEY_PACKAGE);
    expect(readPackage(join(modules, CONTENT_KEY_PACKAGE, "package.json"))).toBeNull();
  });
});
