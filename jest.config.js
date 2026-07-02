// Two jest projects:
//  - unit:       jest-expo preset, fast, colocated in src/**/__tests__/
//  - regression: plain node env, runs the REAL search pipeline against the
//                real ONNX models/assets (onnxruntime-react-native mapped to
//                onnxruntime-node). See jest.regression.config.js.
module.exports = {
  projects: ['<rootDir>/jest.unit.config.js', '<rootDir>/jest.regression.config.js'],
};
