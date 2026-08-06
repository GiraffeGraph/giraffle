const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

/**
 * cborg ships ESM only, and this project's Jest `transformIgnorePatterns` skips
 * everything under `node_modules`, so requiring it there fails on the first
 * `import`. Staging the published source inside the project but outside
 * `node_modules` puts it back in scope for the normal Babel transform, while
 * keeping the transform's own runtime helpers resolvable.
 *
 * This is the real library, not a substitute: the canonical CBOR bytes these
 * tests assert on are the same bytes the device signs and the relay verifies.
 */
function stagedCborg() {
  const source = join(__dirname, "..", "node_modules", "cborg");
  const { version } = require(join(source, "package.json"));
  const staged = join(__dirname, "..", ".jest-staging", `cborg-${version}`);

  if (!existsSync(join(staged, "cborg.js"))) {
    mkdirSync(staged, { recursive: true });
    cpSync(source, staged, { recursive: true });
  }
  return join(staged, "cborg.js");
}

module.exports = require(stagedCborg());
