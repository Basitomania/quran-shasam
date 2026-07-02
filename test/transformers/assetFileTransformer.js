// Jest transformer for binary assets (.onnx, .bin): the module resolves to
// its own absolute file path, so require('../../assets/model.onnx') gives the
// test-side Asset/File mocks something to read from disk.
module.exports = {
  process(_src, filename) {
    return { code: `module.exports = ${JSON.stringify(filename)};` };
  },
};
