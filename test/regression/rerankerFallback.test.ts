/**
 * Pins the reranker failure semantics:
 *  - a rerank runtime failure falls back to retrieval-only results,
 *  - the failure is once-per-session (no rerank retry until a fresh session),
 *  - a reranker INIT failure leaves search fully functional (retrieval-only).
 *
 * ONNX is faked: the bi-encoder session returns a deterministic hidden state
 * that mean-pools to the first verse's real embedding (guaranteeing cosine
 * scores above the retrieval-only 0.35 floor); the reranker session throws
 * on demand. Embeddings/tokenizers are the real assets.
 */
import * as fs from 'fs';
import * as path from 'path';

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const DIMS = 384;

// First verse's real (L2-normalized) embedding — used as the fake pooled
// query vector so retrieval scores are meaningful.
function firstVerseEmbedding(): Float32Array {
  const buf = fs.readFileSync(path.join(ASSETS, 'embeddings.bin'));
  return new Float32Array(buf.buffer.slice(buf.byteOffset + 8, buf.byteOffset + 8 + DIMS * 4));
}

interface OrtMockState {
  rerankRunShouldThrow: boolean;
  rerankCreateShouldThrow: boolean;
  rerankRunCount: number;
}

// Behavior knobs for the fake ORT, re-created per module registry.
function installOrtMock(): OrtMockState {
  const state: OrtMockState = {
    rerankRunShouldThrow: true,
    rerankCreateShouldThrow: false,
    rerankRunCount: 0,
  };

  const emb = firstVerseEmbedding();

  jest.doMock('onnxruntime-node', () => {
    class Tensor {
      constructor(
        public type: string,
        public data: unknown,
        public dims: number[]
      ) {}
    }

    const InferenceSession = {
      create: async (modelPath: string) => {
        const isReranker = modelPath.includes('reranker');
        if (isReranker && state.rerankCreateShouldThrow) {
          throw new Error('mock: reranker create failure');
        }
        if (isReranker) {
          return {
            run: async () => {
              state.rerankRunCount++;
              if (state.rerankRunShouldThrow) throw new Error('mock: rerank OOM');
              throw new Error('mock rerank success path not implemented');
            },
          };
        }
        // Bi-encoder: hidden state = the first verse's embedding tiled across
        // every token position, so masked mean-pool + L2 == that embedding.
        return {
          run: async (feeds: any) => {
            const seqLen = feeds.input_ids.dims[1];
            const hidden = new Float32Array(seqLen * DIMS);
            for (let t = 0; t < seqLen; t++) hidden.set(emb, t * DIMS);
            return { last_hidden_state: { data: hidden } };
          },
        };
      },
    };

    return { InferenceSession, Tensor };
  });

  return state;
}

interface Pipeline {
  semanticSearch: typeof import('../../src/services/semanticSearch');
  reranker: typeof import('../../src/services/reranker');
  verses: any[];
  verseIndex: any[];
}

function loadPipeline(): Pipeline {
  const semanticSearch = require('../../src/services/semanticSearch');
  const reranker = require('../../src/services/reranker');
  const verseIndex = require('../../assets/verse_index.json');
  const verses = verseIndex.map((v: any) => ({
    surah: v.s,
    ayah: v.a,
    surahNameEnglish: v.sn,
    surahNameArabic: v.sa,
    arabicText: v.ar,
    englishText: v.en,
  }));
  return { semanticSearch, reranker, verses, verseIndex };
}

async function initAll(p: Pipeline): Promise<void> {
  const ok = await p.semanticSearch.initSemanticSearch(require('../../assets/tokenizer.json'));
  if (!ok) throw new Error('semantic init failed in test');
  p.semanticSearch.setVerseMeta(p.verseIndex);
  await p.reranker.initReranker(require('../../assets/reranker_tokenizer.json'));
}

beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock('onnxruntime-node');
});

describe('rerank runtime failure', () => {
  it('falls back to retrieval-only results in the same query', async () => {
    const state = installOrtMock();
    const p = loadPipeline();
    await initAll(p);
    expect(p.reranker.isRerankerReady()).toBe(true);

    const results = await p.semanticSearch.semanticSearch('mercy of allah', p.verses, 10);

    expect(state.rerankRunCount).toBe(1);
    expect(results.length).toBeGreaterThan(0);
    // Fallback path labels results as plain semantic matches, not AI-reranked.
    for (const r of results) {
      expect(r.reason).toContain('Semantic match');
    }
  }, 60000);

  it('does not retry rerank for the rest of the session', async () => {
    const state = installOrtMock();
    const p = loadPipeline();
    await initAll(p);

    await p.semanticSearch.semanticSearch('mercy of allah', p.verses, 10);
    await p.semanticSearch.semanticSearch('patience in hardship', p.verses, 10);
    await p.semanticSearch.semanticSearch('day of judgment', p.verses, 10);

    expect(state.rerankRunCount).toBe(1);
  }, 60000);

  it('a fresh module registry (new app session) attempts rerank again', async () => {
    const first = installOrtMock();
    let p = loadPipeline();
    await initAll(p);
    await p.semanticSearch.semanticSearch('mercy of allah', p.verses, 10);
    expect(first.rerankRunCount).toBe(1);

    // New session.
    jest.resetModules();
    const second = installOrtMock();
    p = loadPipeline();
    await initAll(p);
    await p.semanticSearch.semanticSearch('mercy of allah', p.verses, 10);
    expect(second.rerankRunCount).toBe(1);
  }, 60000);
});

describe('reranker init failure', () => {
  it('leaves isRerankerReady false and search functional (retrieval-only)', async () => {
    const state = installOrtMock();
    state.rerankCreateShouldThrow = true;

    const p = loadPipeline();
    await initAll(p);

    expect(p.reranker.isRerankerReady()).toBe(false);

    const results = await p.semanticSearch.semanticSearch('mercy of allah', p.verses, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(state.rerankRunCount).toBe(0);
    for (const r of results) {
      expect(r.reason).toContain('Semantic match');
    }
  }, 60000);
});

describe('uninitialized semantic search', () => {
  it('semanticSearch throws before initSemanticSearch', async () => {
    installOrtMock();
    const p = loadPipeline();
    await expect(p.semanticSearch.semanticSearch('mercy', p.verses, 10)).rejects.toThrow(
      'not initialized'
    );
  });
});
