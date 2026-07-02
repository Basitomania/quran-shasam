// Regression project: runs the REAL app search code in Node against the REAL
// assets in assets/. onnxruntime-react-native is API-compatible with
// onnxruntime-node (InferenceSession, Tensor), so the pipeline executes
// unmodified. expo-asset / expo-file-system are mocked to read from disk,
// mirroring the JSI load pattern the app uses on device (File.bytes(),
// file://-stripped path into InferenceSession.create).
module.exports = {
  displayName: 'regression',
  // Single-context environment: ORT-node's native binding returns typed
  // arrays from the host realm; jest's default vm-context environment fails
  // `instanceof Float32Array` checks on them.
  testEnvironment: 'jest-environment-node-single-context',
  testMatch: ['<rootDir>/test/regression/**/*.test.ts'],
  transform: {
    '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
    '\\.(onnx|bin)$': '<rootDir>/test/transformers/assetFileTransformer.js',
  },
  moduleNameMapper: {
    '^onnxruntime-react-native$': 'onnxruntime-node',
    '^expo-asset$': '<rootDir>/test/mocks/expo-asset.ts',
    '^expo-file-system$': '<rootDir>/test/mocks/expo-file-system.ts',
  },
  // Two ~22 MB models + 9 MB embeddings live in one worker; keep memory bounded.
  maxWorkers: 1,
};
