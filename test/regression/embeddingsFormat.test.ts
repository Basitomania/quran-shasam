/**
 * Pins the embeddings.bin binary format against verse_index.json.
 * Catches bad asset regeneration (step2/step3 of the model pipeline):
 * count mismatch, dimension change, or a truncated/corrupt file.
 */
import * as fs from 'fs';

const embeddingsPath = require('../../assets/embeddings.bin') as string;
const verseIndex = require('../../assets/verse_index.json') as unknown[];

describe('embeddings.bin format', () => {
  const buf = fs.readFileSync(embeddingsPath);
  const header = new Uint32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + 8));
  const count = header[0];
  const dims = header[1];

  it('header count matches verse_index.json length', () => {
    expect(count).toBe(verseIndex.length);
  });

  it('dimensions are 384 (MiniLM)', () => {
    expect(dims).toBe(384);
  });

  it('file length is exactly 8 + count * dims * 4 bytes', () => {
    expect(buf.byteLength).toBe(8 + count * dims * 4);
  });

  it('embeddings are L2-normalized (spot check first and last verse)', () => {
    const data = new Float32Array(
      buf.buffer.slice(buf.byteOffset + 8, buf.byteOffset + 8 + count * dims * 4)
    );
    for (const index of [0, count - 1]) {
      let norm = 0;
      for (let d = 0; d < dims; d++) {
        const x = data[index * dims + d];
        norm += x * x;
      }
      expect(Math.sqrt(norm)).toBeCloseTo(1, 2);
    }
  });
});
