/**
 * Pins the keyword-search scoring model: exact keyword +2, 4-6-char prefix
 * expansion +1, whole-phrase hit in topics/english +5, minimum total 2.
 * Uses a tiny hand-built index, not the 6.6 MB production asset.
 */
import { loadSearchIndex, searchByTheme } from '../localThematicSearch';
import { QuranVerse } from '../../types/quran';

const verse = (surah: number, ayah: number, english: string): QuranVerse => ({
  surah,
  ayah,
  surahNameEnglish: `Surah${surah}`,
  surahNameArabic: `سورة${surah}`,
  arabicText: 'نص',
  englishText: english,
});

const VERSES: QuranVerse[] = [
  verse(1, 1, 'In the name of Allah the merciful'),
  verse(2, 30, 'And when your Lord said to the angels I will make a successor'),
  verse(12, 4, 'When Joseph said to his father I saw eleven stars'),
  verse(94, 5, 'Indeed with hardship comes ease'),
];

// keyword -> [surah, ayah][]
const KEYWORD_INDEX = {
  mercy: [[1, 1]] as [number, number][],
  merciful: [[1, 1]] as [number, number][],
  angels: [[2, 30]] as [number, number][],
  creation: [[2, 30]] as [number, number][],
  created: [[2, 30]] as [number, number][],
  joseph: [[12, 4]] as [number, number][],
  dream: [[12, 4]] as [number, number][],
  hardship: [[94, 5]] as [number, number][],
  patience: [[94, 5]] as [number, number][],
};

// verse index entries: only s/a/t/en matter for scoring
const VERSE_INDEX = [
  { s: 1, a: 1, sn: 'Al-Faatiha', sa: 'الفاتحة', ar: 'نص', en: 'In the name of Allah the merciful', t: 'mercy, merciful, basmala' },
  { s: 2, a: 30, sn: 'Al-Baqara', sa: 'البقرة', ar: 'نص', en: 'And when your Lord said to the angels I will make a successor', t: 'angels, creation of Adam, khalifah' },
  { s: 12, a: 4, sn: 'Yusuf', sa: 'يوسف', ar: 'نص', en: 'When Joseph said to his father I saw eleven stars', t: 'Joseph, Yusuf, dream, eleven stars' },
  { s: 94, a: 5, sn: 'Ash-Sharh', sa: 'الشرح', ar: 'نص', en: 'Indeed with hardship comes ease', t: 'hardship, ease, patience, relief' },
];

describe('searchByTheme', () => {
  describe('before loadSearchIndex', () => {
    it('throws', () => {
      // Fresh module registry so the module-level index state is unset.
      jest.isolateModules(() => {
        const fresh = require('../localThematicSearch');
        expect(() => fresh.searchByTheme('mercy', VERSES)).toThrow('Search index not loaded');
      });
    });
  });

  describe('with index loaded', () => {
    beforeAll(async () => {
      await loadSearchIndex(KEYWORD_INDEX as any, VERSE_INDEX as any);
    });

    it('returns [] for an empty query', () => {
      expect(searchByTheme('', VERSES)).toEqual([]);
    });

    it('returns [] for a stopwords-only query', () => {
      expect(searchByTheme('the and of what', VERSES)).toEqual([]);
    });

    it('finds a verse by exact keyword', () => {
      const results = searchByTheme('angels', VERSES);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].verse.surah).toBe(2);
      expect(results[0].verse.ayah).toBe(30);
    });

    it('reports matched terms in the reason', () => {
      const results = searchByTheme('angels', VERSES);
      expect(results[0].reason).toContain('angels');
    });

    it('expands 4+ char words by prefix against the keyword index', () => {
      // "creat" is not an index key, but shares the prefix of
      // "creation"/"created" → prefix credit (+1 each) reaches min score 2.
      const results = searchByTheme('creat creat', VERSES);
      // Single sub-3-char guard: 'creat' is 5 chars so prefix path applies.
      const keys = results.map((r) => `${r.verse.surah}:${r.verse.ayah}`);
      expect(keys).toContain('2:30');
    });

    it('a short fragment can still hit via the substring phrase bonus', () => {
      // Characterizes actual behavior: the phrase-match path is a raw
      // substring `includes()`, so "mer" (3 chars — below the ≥4 prefix
      // cutoff, not an index key) still matches "merciful" in 1:1's topics.
      const results = searchByTheme('mer', VERSES);
      expect(results.map((r) => `${r.verse.surah}:${r.verse.ayah}`)).toContain('1:1');
    });

    it('a 3-char word matching nothing returns no results', () => {
      // Below prefix-expansion cutoff, not an index key, not a substring of
      // any topics/english text → no scoring path applies.
      expect(searchByTheme('qzx', VERSES)).toEqual([]);
    });

    it('a single exact keyword hit (+2) meets the minimum score of 2', () => {
      const results = searchByTheme('hardship', VERSES);
      expect(results.map((r) => `${r.verse.surah}:${r.verse.ayah}`)).toContain('94:5');
    });

    it('phrase match in topics/english scores a strong bonus and ranks first', () => {
      // The full phrase "eleven stars" appears in 12:4's topics and english.
      const results = searchByTheme('eleven stars', VERSES);
      expect(results.length).toBeGreaterThan(0);
      expect(`${results[0].verse.surah}:${results[0].verse.ayah}`).toBe('12:4');
    });

    it('respects topN', () => {
      const results = searchByTheme('mercy angels joseph hardship', VERSES, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('drops scored refs that are missing from the verses lookup', () => {
      // Search with a verses array missing 94:5 — the scored key silently drops.
      const withoutSharh = VERSES.filter((v) => v.surah !== 94);
      const results = searchByTheme('hardship', withoutSharh);
      expect(results.every((r) => r.verse.surah !== 94)).toBe(true);
    });

    it('is case-insensitive', () => {
      const results = searchByTheme('ANGELS', VERSES);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].verse.surah).toBe(2);
    });
  });
});
