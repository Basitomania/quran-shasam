module.exports = {
  displayName: 'unit',
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/src/**/__tests__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/test/setup.unit.js'],
  transform: {
    '\\.(onnx|bin)$': '<rootDir>/test/transformers/assetFileTransformer.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-.*|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|expo-modules-core|onnxruntime-react-native|fuse.js)/)',
  ],
};
