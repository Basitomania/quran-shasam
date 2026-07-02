import Fuse from 'fuse.js';
import { QuranVerse, VerseMatch, MatchLanguage } from '../types/quran';
import { normalizeArabic, normalizeEnglish } from './arabicNormalizer';

interface IndexedVerse {
  verse: QuranVerse;
  normalizedArabic: string;
  normalizedEnglish: string;
}

export class VerseMatcher {
  private indexedVerses: IndexedVerse[];
  private arabicFuse: Fuse<IndexedVerse>;
  private englishFuse: Fuse<IndexedVerse>;

  constructor(verses: QuranVerse[]) {
    this.indexedVerses = verses.map((verse) => ({
      verse,
      normalizedArabic: normalizeArabic(verse.arabicText),
      normalizedEnglish: normalizeEnglish(verse.englishText),
    }));

    const fuseOptions = {
      includeScore: true,
      threshold: 0.6,
      distance: 2000,
      minMatchCharLength: 2,
      shouldSort: true,
      ignoreLocation: true,
    };

    this.arabicFuse = new Fuse(this.indexedVerses, {
      ...fuseOptions,
      keys: ['normalizedArabic'],
    });

    this.englishFuse = new Fuse(this.indexedVerses, {
      ...fuseOptions,
      keys: ['normalizedEnglish'],
    });
  }

  findTopMatches(
    input: string,
    topN: number = 3,
    language: MatchLanguage = 'both',
    minScore: number = 20
  ): VerseMatch[] {
    if (!input.trim()) return [];

    let results: VerseMatch[] = [];

    if (language === 'arabic' || language === 'both') {
      const normalized = normalizeArabic(input);
      console.log('[VerseMatcher] Arabic normalized input:', normalized);
      // Check for substring containment first
      const containsMatches = this.findContainmentMatches(normalized, 'arabic');
      const fuseMatches = this.arabicFuse.search(normalized, { limit: topN * 3 });

      console.log('[VerseMatcher] Arabic containment:', containsMatches.length, 'fuse:', fuseMatches.length);
      if (fuseMatches.length > 0) {
        console.log('[VerseMatcher] Top fuse score:', fuseMatches[0].score, 'verse:', fuseMatches[0].item.verse.surah + ':' + fuseMatches[0].item.verse.ayah);
      }

      results.push(...containsMatches);
      results.push(
        ...fuseMatches.map((r) => ({
          verse: r.item.verse,
          score: Math.round((1 - (r.score ?? 1)) * 100),
        }))
      );
    }

    if (language === 'english' || language === 'both') {
      const normalized = normalizeEnglish(input);
      console.log('[VerseMatcher] English normalized input:', normalized);
      const containsMatches = this.findContainmentMatches(normalized, 'english');
      const fuseMatches = this.englishFuse.search(normalized, { limit: topN * 3 });

      console.log('[VerseMatcher] English containment:', containsMatches.length, 'fuse:', fuseMatches.length);
      if (fuseMatches.length > 0) {
        console.log('[VerseMatcher] Top fuse score:', fuseMatches[0].score, 'verse:', fuseMatches[0].item.verse.surah + ':' + fuseMatches[0].item.verse.ayah);
      }

      results.push(...containsMatches);
      results.push(
        ...fuseMatches.map((r) => ({
          verse: r.item.verse,
          score: Math.round((1 - (r.score ?? 1)) * 100),
        }))
      );
    }

    // Deduplicate by surah:ayah, keeping highest score
    const seen = new Map<string, VerseMatch>();
    for (const match of results) {
      const key = `${match.verse.surah}:${match.verse.ayah}`;
      const existing = seen.get(key);
      if (!existing || match.score > existing.score) {
        seen.set(key, match);
      }
    }

    const final = Array.from(seen.values())
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    console.log('[VerseMatcher] Final results:', final.length, 'out of', seen.size, 'unique matches');
    return final;
  }

  private findContainmentMatches(
    normalized: string,
    lang: 'arabic' | 'english'
  ): VerseMatch[] {
    if (normalized.length < 5) return [];

    const matches: VerseMatch[] = [];
    for (const item of this.indexedVerses) {
      const verseText =
        lang === 'arabic' ? item.normalizedArabic : item.normalizedEnglish;
      if (verseText.includes(normalized) || normalized.includes(verseText)) {
        const ratio = Math.round(
          (2 * Math.min(normalized.length, verseText.length)) /
            (normalized.length + verseText.length) *
            100
        );
        matches.push({ verse: item.verse, score: Math.max(ratio, 85) });
      }
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, 5);
  }
}
