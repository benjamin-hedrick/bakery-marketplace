// The shared customer package lives outside this folder (packages/customer-core, WI-MOB-001), so Metro must watch it.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const core = path.resolve(__dirname, '../../packages/customer-core');
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), core];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
