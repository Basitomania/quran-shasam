/**
 * Search-quality regression gate.
 *
 * Runs the REAL app pipeline — bi-encoder retrieval → hybrid candidate pool
 * → cross-encoder rerank — in Node against the REAL bundled assets
 * (onnxruntime-react-native mapped to onnxruntime-node; expo-asset /
 * expo-file-system mocked to read from disk). The known-answer cases are the
 * same SANITY_CASES the on-device __DEV__ harness uses.
 *
 * Gate: 10/10 in top-3 — matches the device ground truth (iOS + Android) and
 * the first Node run reproduced it exactly. If ORT-node drift ever flips a
 * single rank on the int8 reranker, relax to 9/10 with a note here rather
 * than deleting the failing case.
 *
 * Timings are always logged. Hard latency assertions only run with
 * CHECK_LATENCY=1 (CI runner variance makes them flaky as a default gate).
 */
import { initSemanticSearch, setVerseMeta, semanticSearch } from '../../src/services/semanticSearch';
import { initReranker, isRerankerReady } from '../../src/services/reranker';
import { SANITY_CASES } from '../../src/dev/searchSanity';
import { QuranVerse } from '../../src/types/quran';

const MIN_PASSING = 10;

interface VerseIndexEntry {
  s: number;
  a: number;
  sn: string;
  sa: string;
  ar: string;
  en: string;
  t: string;
}

const verseIndex = require('../../assets/verse_index.json') as VerseIndexEntry[];
const tokenizerData = require('../../assets/tokenizer.json');
const rerankerTokenizerData = require('../../assets/reranker_tokenizer.json');

const verses: QuranVerse[] = verseIndex.map((v) => ({
  surah: v.s,
  ayah: v.a,
  surahNameEnglish: v.sn,
  surahNameArabic: v.sa,
  arabicText: v.ar,
  englishText: v.en,
}));

describe('search quality (real ONNX, real assets)', () => {
  beforeAll(async () => {
    // Silence the services' verbose init logging; keep warnings/errors.
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const semanticOk = await initSemanticSearch(tokenizerData);
    if (!semanticOk) throw new Error('initSemanticSearch failed — check asset mocks');
    setVerseMeta(verseIndex);

    const rerankerOk = await initReranker(rerankerTokenizerData);
    if (!rerankerOk) throw new Error('initReranker failed — check asset mocks');
  }, 120000);

  it('reranker is active for this run', () => {
    expect(isRerankerReady()).toBe(true);
  });

  it(`sanity set: >= ${MIN_PASSING}/${SANITY_CASES.length} expected verses in top-3`, async () => {
    const lines: string[] = [];
    let passed = 0;
    let totalMs = 0;

    for (const c of SANITY_CASES) {
      const t0 = Date.now();
      const results = await semanticSearch(c.query, verses, 10);
      const ms = Date.now() - t0;
      totalMs += ms;

      const top3 = results.slice(0, 3).map((r) => `${r.verse.surah}:${r.verse.ayah}`);
      const hit = top3.some((ref) => c.check(ref));
      if (hit) passed++;
      lines.push(
        `${hit ? 'PASS' : 'FAIL'}  ${c.query.padEnd(34)} top3=[${top3.join(', ')}]  ${ms}ms` +
          (hit ? '' : `  (expected ${c.expects})`)
      );
    }

    // Per-case results always visible in test output, pass or fail.
    process.stdout.write(
      `\n[searchQuality] ${passed}/${SANITY_CASES.length} passed, ` +
        `avg ${Math.round(totalMs / SANITY_CASES.length)}ms/query\n` +
        lines.map((l) => `  ${l}`).join('\n') +
        '\n'
    );

    expect(passed).toBeGreaterThanOrEqual(MIN_PASSING);

    if (process.env.CHECK_LATENCY) {
      // Generous Node budget; the device budget (spec 012) is measured
      // by the on-device harness instead.
      expect(totalMs / SANITY_CASES.length).toBeLessThan(3000);
    }
  }, 120000);

  it('a query with no plausible match returns results without throwing', async () => {
    const results = await semanticSearch('zzzz qqqq xxxx', verses, 10);
    expect(Array.isArray(results)).toBe(true);
  });
});
