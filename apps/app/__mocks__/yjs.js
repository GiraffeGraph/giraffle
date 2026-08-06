const { join } = require("node:path");

/**
 * `@giraffle/sync` lives outside this project, so Jest resolves its `yjs` import
 * against the repository root while app code resolves against this project.
 * Two copies of Yjs mean two class identities and `instanceof` checks that fail
 * across them. Metro already collapses this through `nodeModulesPaths`; the
 * suite pins the same single copy.
 */
module.exports = require(join(__dirname, "..", "node_modules", "yjs"));
