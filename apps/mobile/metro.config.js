const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The Savanna canvas ships as one self-contained HTML file loaded from disk.
config.resolver.assetExts = [...config.resolver.assetExts, "html"];

module.exports = config;
