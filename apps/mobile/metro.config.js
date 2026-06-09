const { getDefaultConfig } = require('expo/metro-config');

// SDK 52+ auto-detects the npm-workspaces monorepo root and configures
// watchFolders/nodeModulesPaths accordingly — no manual config needed.
const config = getDefaultConfig(__dirname);

module.exports = config;
