const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// The Savanna canvas ships as one self-contained HTML file loaded from disk.
config.resolver.assetExts = [...config.resolver.assetExts, "html"];

// @giraffle/* packages are linked from the repo root and shipped as TypeScript
// source, so Metro has to watch and transpile them alongside the app.
config.watchFolders = [path.resolve(repoRoot, "packages")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

module.exports = config;
