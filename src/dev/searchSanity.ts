/**
 * Dev-only on-device sanity suite for semantic search quality.
 *
 * Runs the 10 known-answer queries from specs 012/013 through the REAL
 * on-device pipeline (bi-encoder ONNX -> hybrid pool -> cross-encoder
 * rerank) and checks the expected verses land in the top-3.
 *
 * Expected-verse criteria mirror the Python-side harness used to gate the
 * pipeline (story-relevant sets, not single refs, where the story spans
 * many verses). Target: >= 8/10.
 *
 * Never imported in production code paths — only behind __DEV__.
 */

import { QuranVerse } from '../types/quran';
import { semanticSearch } from '../services/semanticSearch';
import { isRerankerReady } from '../services/reranker';

interface SanityCase {
  query: string;
  /** Human-readable expectation, shown in failure output. */
  expects: string;
  check: (ref: string) => boolean;
}

const inSurahRange = (ref: string, surah: number, lo: number, hi: number): boolean => {
  const [s, a] = ref.split(':').map(Number);
  return s === surah && a >= lo && a <= hi;
};

export const SANITY_CASES: SanityCase[] = [
  {
    query: 'Story of Balqis',
    expects: 'An-Naml 27:22-44',
    check: (r) => inSurahRange(r, 27, 22, 44),
  },
  {
    query: 'Queen of Sheba',
    expects: 'An-Naml 27:22-44',
    check: (r) => inSurahRange(r, 27, 22, 44),
  },
  {
    query: 'People of the cave',
    expects: 'Al-Kahf 18:9-25',
    check: (r) => inSurahRange(r, 18, 9, 25),
  },
  {
    query: 'Dhul-Qarnayn',
    expects: 'Al-Kahf 18:83-98',
    check: (r) => inSurahRange(r, 18, 83, 98),
  },
  {
    query: 'Splitting of the moon',
    expects: 'Al-Qamar 54:1',
    check: (r) => r === '54:1',
  },
  {
    query: 'Night journey',
    expects: 'Al-Isra 17:1',
    check: (r) => r === '17:1',
  },
  {
    query: 'Story of Yusuf and his brothers',
    expects: 'Surah Yusuf (12)',
    check: (r) => r.startsWith('12:'),
  },
  {
    query: 'Mary and baby Jesus',
    expects: 'Maryam 19 or annunciation verses',
    check: (r) => r.startsWith('19:') || ['3:45', '3:46', '3:47', '21:91', '23:50', '61:6'].includes(r),
  },
  {
    query: 'Building of the Kaaba',
    expects: 'Kaaba-building verses (2:125-127, 3:96-97, 5:97, 22:26)',
    check: (r) => ['2:125', '2:126', '2:127', '3:96', '3:97', '5:97', '22:26'].includes(r),
  },
  {
    query: 'Battle of Badr',
    expects: 'Badr verses (Al-Anfal 8 or 3:123-125)',
    check: (r) =>
      ['8:5', '8:7', '8:9', '8:11', '8:12', '8:17', '8:19', '8:42', '8:43', '8:44', '3:123', '3:124', '3:125'].includes(r),
  },
];

export interface SanityCaseResult {
  query: string;
  pass: boolean;
  top3: string[];
  ms: number;
  expects: string;
}

export interface SanitySuiteResult {
  passed: number;
  total: number;
  rerankActive: boolean;
  totalMs: number;
  results: SanityCaseResult[];
}

/**
 * Run all sanity cases sequentially through the live search pipeline.
 * Logs per-case results to the Metro console as it goes.
 */
export async function runSearchSanity(verses: QuranVerse[]): Promise<SanitySuiteResult> {
  const rerankActive = isRerankerReady();
  console.log(`[Sanity] === RUN START (rerank ${rerankActive ? 'ON' : 'OFF'}) ===`);

  const results: SanityCaseResult[] = [];
  const t0 = Date.now();

  for (const c of SANITY_CASES) {
    const start = Date.now();
    let top3: string[] = [];
    try {
      const res = await semanticSearch(c.query, verses, 10);
      top3 = res.slice(0, 3).map((r) => `${r.verse.surah}:${r.verse.ayah}`);
    } catch (err) {
      console.warn(`[Sanity] "${c.query}" threw:`, err);
    }
    const ms = Date.now() - start;
    const pass = top3.some((r) => c.check(r));
    results.push({ query: c.query, pass, top3, ms, expects: c.expects });
    console.log(
      `[Sanity] ${pass ? 'PASS' : 'FAIL'}  "${c.query}"  top3=[${top3.join(', ')}]  ${ms}ms` +
        (pass ? '' : `  (expected ${c.expects})`)
    );
  }

  const passed = results.filter((r) => r.pass).length;
  const totalMs = Date.now() - t0;
  console.log(`[Sanity] === ${passed}/${results.length} passed, ${totalMs}ms total, rerank ${rerankActive ? 'ON' : 'OFF'} ===`);

  return { passed, total: results.length, rerankActive, totalMs, results };
}
