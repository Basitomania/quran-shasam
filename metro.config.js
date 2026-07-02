const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add custom asset extensions for ONNX model and binary embeddings
config.resolver.assetExts.push('onnx', 'bin');

module.exports = config;
