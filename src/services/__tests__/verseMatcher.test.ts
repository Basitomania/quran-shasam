/**
 * Characterization tests for VerseMatcher.
 *
 * The Fuse options here are CLAUDE.md non-negotiables (tuned through real
 * debugging hours): threshold 0.6, distance 2000, ignoreLocation true,
 * min-score 20. If any test in the "tuned constants" block fails, someone
 * changed a load-bearing value — that requires a spec, not a drive-by edit.
 */
import * as fs from 'fs';
import * as path from 'path';
import { VerseMatcher } from '../verseMatcher';
import { FIXTURE_VERSES } from '../../../test/fixtures/verses.small';

// Silence the matcher's diagnostic logging in test output.
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('tuned constants (CLAUDE.md non-negotiables)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'verseMatcher.ts'), 'utf8');

  it('pins threshold 0.6', () => {
    expect(source).toMatch(/threshold:\s*0\.6\b/);
  });

  it('pins distance 2000', () => {
    expect(source).toMatch(/distance:\s*2000\b/);
  });

  it('pins ignoreLocation true', () => {
    expect(source).toMatch(/ignoreLocation:\s*true\b/);
  });

  it('pins the default minScore of 20', () => {
    expect(source).toMatch(/minScore:\s*number\s*=\s*20\b/);
  });
});

describe('findTopMatches', () => {
  let matcher: VerseMatcher;

  beforeAll(() => {
    matcher = new VerseMatcher(FIXTURE_VERSES);
  });

  it('returns [] for empty and whitespace-only input', () => {
    expect(matcher.findTopMatches('')).toEqual([]);
    expect(matcher.findTopMatches('   ')).toEqual([]);
  });

  it('finds an exact English phrase via containment with a high score', () => {
    const results = matcher.findTopMatches('In the name of Allah, the Entirely Merciful', 3, 'english');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].verse.surah).toBe(1);
    expect(results[0].verse.ayah).toBe(1);
    // Containment matches floor at 85.
    expect(results[0].score).toBeGreaterThanOrEqual(85);
  });

  it('finds an Arabic verse when the query carries different diacritics', () => {
    // Fixture 112:1 is "قُلْ هُوَ ٱللَّهُ أَحَدٌ" — query it fully unvocalized.
    const results = matcher.findTopMatches('قل هو الله احد', 3, 'arabic');
    expect(results.length).toBeGreaterThan(0);
    expect(`${results[0].verse.surah}:${results[0].verse.ayah}`).toBe('112:1');
  });

  it('does not use the containment path for normalized input under 5 chars', () => {
    // 4-char normalized Arabic input: containment path returns nothing;
    // any results must come from fuse (score < 85 unless fuse is very sure).
    const results = matcher.findTopMatches('قل', 3, 'arabic');
    for (const r of results) {
      // No containment-floored 85+ scores for a 2-char query.
      expect(r.score).toBeLessThan(100);
    }
  });

  it('deduplicates by surah:ayah keeping one entry per verse', () => {
    // A phrase matching both containment and fuse for the same verse.
    const results = matcher.findTopMatches('the Entirely Merciful', 10, 'english');
    const keys = results.map((r) => `${r.verse.surah}:${r.verse.ayah}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respects topN', () => {
    const results = matcher.findTopMatches('Allah', 2, 'english');
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('filters out results below minScore', () => {
    const results = matcher.findTopMatches('the Entirely Merciful', 10, 'english', 20);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(20);
    }
  });

  it('a raised minScore drops weaker matches that a lower one keeps', () => {
    const loose = matcher.findTopMatches('mercy of allah', 10, 'english', 1);
    const strict = matcher.findTopMatches('mercy of allah', 10, 'english', 90);
    expect(strict.length).toBeLessThanOrEqual(loose.length);
    for (const r of strict) {
      expect(r.score).toBeGreaterThanOrEqual(90);
    }
  });

  it('returns results sorted by descending score', () => {
    const results = matcher.findTopMatches('praise be to Allah lord of the worlds', 5, 'english', 1);
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('language=both searches both indexes', () => {
    const arabicOnly = matcher.findTopMatches('قل هو الله احد', 3, 'both');
    expect(arabicOnly.length).toBeGreaterThan(0);
    const englishOnly = matcher.findTopMatches('Entirely Merciful', 3, 'both');
    expect(englishOnly.length).toBeGreaterThan(0);
  });

  it('returns [] when nothing plausibly matches', () => {
    const results = matcher.findTopMatches('zzzz qqqq xxxx', 3, 'english');
    expect(results).toEqual([]);
  });
});

describe('spec 015 — performance path', () => {
  let matcher: VerseMatcher;

  beforeAll(() => {
    matcher = new VerseMatcher(FIXTURE_VERSES);
  });

  it('containment short-circuit: a long exact paste skips fuse but still identifies the verse', () => {
    const logSpy = console.log as jest.Mock;
    logSpy.mockClear();
    const results = matcher.findTopMatches(
      'In the name of Allah, the Entirely Merciful',
      5,
      'english'
    );
    expect(`${results[0].verse.surah}:${results[0].verse.ayah}`).toBe('1:1');
    expect(results[0].score).toBeGreaterThanOrEqual(85);
    const skipped = logSpy.mock.calls.some((args) =>
      String(args[0]).includes('containment short-circuit')
    );
    expect(skipped).toBe(true);
  });

  it('input over 32 chars with no containment hit still completes and returns []', () => {
    const results = matcher.findTopMatches(
      'zzzz qqqq xxxx wwww vvvv uuuu tttt ssss',
      3,
      'english'
    );
    expect(results).toEqual([]);
  });

  describe('findTopMatchesAsync', () => {
    const PARITY_QUERIES: [string, 'arabic' | 'english' | 'both'][] = [
      ['Allah', 'english'],
      ['mercy of allah', 'english'],
      ['In the name of Allah, the Entirely Merciful', 'english'],
      ['قل هو الله احد', 'arabic'],
      ['Entirely Merciful', 'both'],
      ['zzzz qqqq xxxx', 'english'],
      ['', 'english'],
    ];

    it('resolves the same results as the sync path', async () => {
      for (const [query, language] of PARITY_QUERIES) {
        const sync = matcher.findTopMatches(query, 5, language);
        const async = await matcher.findTopMatchesAsync(query, 5, language);
        expect(async).toEqual(sync);
      }
    });

    it('resolves null when the token is aborted before the search starts', async () => {
      const token = { aborted: true };
      const result = await matcher.findTopMatchesAsync('mercy of allah', 5, 'english', 20, token);
      expect(result).toBeNull();
    });

    it('resolves null when the token is aborted mid-search', async () => {
      const token = { aborted: false };
      // 'mercy of allah' has no containment hit, so the fuse shard loop runs
      // and yields to the event loop, where the abort lands.
      const pending = matcher.findTopMatchesAsync('mercy of allah', 5, 'english', 20, token);
      token.aborted = true;
      expect(await pending).toBeNull();
    });
  });
});
