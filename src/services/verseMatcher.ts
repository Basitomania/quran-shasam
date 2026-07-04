import Fuse, { FuseResult } from 'fuse.js';
import { QuranVerse, VerseMatch, MatchLanguage } from '../types/quran';
import { normalizeArabic, normalizeEnglish } from './arabicNormalizer';

interface IndexedVerse {
  verse: QuranVerse;
  normalizedArabic: string;
  normalizedEnglish: string;
}

export interface SearchCancelToken {
  aborted: boolean;
}

// Fuse's bitap runs one pass per allowed error (threshold x pattern length)
// and splits patterns past 32 chars into extra full passes over every verse,
// so search cost grows with input length. Capping the fuse pattern bounds
// that work; containment always sees the full normalized text. See spec 015.
const MAX_FUSE_PATTERN_LENGTH = 32;

// A 20+ char exact substring in a 6236-verse corpus is a near-unique
// identifier: containment hits at that length make the fuse pass redundant.
const CONTAINMENT_SHORT_CIRCUIT_LENGTH = 20;

// Fuse scoring is per-record (bitap score x per-field length norm), so
// sharding the index and merging results is score-identical to a single
// instance. Shards let the async search yield to the event loop between
// batches instead of blocking the JS thread for the whole corpus.
const FUSE_SHARD_SIZE = 250;

function capFusePattern(normalized: string): string {
  if (normalized.length <= MAX_FUSE_PATTERN_LENGTH) return normalized;
  const hardCut = normalized.slice(0, MAX_FUSE_PATTERN_LENGTH);
  if (normalized.charAt(MAX_FUSE_PATTERN_LENGTH) === ' ') return hardCut;
  const lastSpace = hardCut.lastIndexOf(' ');
  return lastSpace > 0 ? hardCut.slice(0, lastSpace) : hardCut;
}

export class VerseMatcher {
  private indexedVerses: IndexedVerse[];
  private arabicShards: Fuse<IndexedVerse>[];
  private englishShards: Fuse<IndexedVerse>[];

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

    this.arabicShards = [];
    this.englishShards = [];
    for (let i = 0; i < this.indexedVerses.length; i += FUSE_SHARD_SIZE) {
      const shard = this.indexedVerses.slice(i, i + FUSE_SHARD_SIZE);
      this.arabicShards.push(
        new Fuse(shard, { ...fuseOptions, keys: ['normalizedArabic'] })
      );
      this.englishShards.push(
        new Fuse(shard, { ...fuseOptions, keys: ['normalizedEnglish'] })
      );
    }
  }

  findTopMatches(
    input: string,
    topN: number = 3,
    language: MatchLanguage = 'both',
    minScore: number = 20
  ): VerseMatch[] {
    const steps = this.searchSteps(input, topN, language, minScore);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }

  async findTopMatchesAsync(
    input: string,
    topN: number = 3,
    language: MatchLanguage = 'both',
    minScore: number = 20,
    token?: SearchCancelToken
  ): Promise<VerseMatch[] | null> {
    if (token?.aborted) return null;
    const steps = this.searchSteps(input, topN, language, minScore);
    let step = steps.next();
    while (!step.done) {
      // Yield to the event loop between shards so touch and typing events
      // interleave with the search instead of freezing the JS thread.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (token?.aborted) return null;
      step = steps.next();
    }
    return step.value;
  }

  // Single search pipeline for both entry points: yields once per fuse
  // shard so the async caller can time-slice; the sync caller just drains.
  private *searchSteps(
    input: string,
    topN: number,
    language: MatchLanguage,
    minScore: number
  ): Generator<void, VerseMatch[], void> {
    if (!input.trim()) return [];

    const results: VerseMatch[] = [];
    const languages: ('arabic' | 'english')[] =
      language === 'both' ? ['arabic', 'english'] : [language];

    for (const lang of languages) {
      const normalized =
        lang === 'arabic' ? normalizeArabic(input) : normalizeEnglish(input);
      console.log(`[VerseMatcher] ${lang} normalized input:`, normalized);

      // Check for substring containment first
      const containsMatches = this.findContainmentMatches(normalized, lang);
      results.push(...containsMatches);

      // Containment-first short-circuit: a full page of exact-substring hits,
      // or any hit on a long paste, makes the fuse pass redundant (spec 015).
      const skipFuse =
        containsMatches.length >= topN ||
        (normalized.length >= CONTAINMENT_SHORT_CIRCUIT_LENGTH &&
          containsMatches.length > 0);
      if (skipFuse) {
        console.log(
          `[VerseMatcher] ${lang} containment short-circuit:`,
          containsMatches.length,
          'matches, skipping fuse'
        );
        continue;
      }

      const pattern = capFusePattern(normalized);
      const shards = lang === 'arabic' ? this.arabicShards : this.englishShards;
      const fuseMatches: FuseResult<IndexedVerse>[] = [];
      for (const shard of shards) {
        fuseMatches.push(...shard.search(pattern, { limit: topN * 3 }));
        yield;
      }

      console.log(
        `[VerseMatcher] ${lang} containment:`,
        containsMatches.length,
        'fuse:',
        fuseMatches.length
      );
      if (fuseMatches.length > 0) {
        const top = fuseMatches.reduce((a, b) =>
          (a.score ?? 1) <= (b.score ?? 1) ? a : b
        );
        console.log(
          '[VerseMatcher] Top fuse score:',
          top.score,
          'verse:',
          top.item.verse.surah + ':' + top.item.verse.ayah
        );
      }

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

    const matches: { verse: QuranVerse; score: number; text: string }[] = [];
    for (const item of this.indexedVerses) {
      const verseText =
        lang === 'arabic' ? item.normalizedArabic : item.normalizedEnglish;
      if (verseText.includes(normalized) || normalized.includes(verseText)) {
        const ratio = Math.round(
          (2 * Math.min(normalized.length, verseText.length)) /
            (normalized.length + verseText.length) *
            100
        );
        matches.push({ verse: item.verse, score: Math.max(ratio, 85), text: verseText });
      }
    }

    // Prefix tie-break (spec 017): when verse A's text is a strict prefix of
    // verse B's text AND the query extends beyond A's text, the length-ratio
    // score prefers the shorter exact verse A even though the extra query
    // words can only belong to B (real case: 3:2 is a strict prefix of 2:255;
    // the opening of Ayat al-Kursi used to resolve to 3:2). Ordering only —
    // bump B just above A; the ratio formula itself is untouched.
    for (const a of matches) {
      if (normalized.length <= a.text.length) continue; // query doesn't extend beyond A
      for (const b of matches) {
        if (b === a) continue;
        if (b.text.length > a.text.length && b.text.startsWith(a.text)) {
          b.score = Math.max(b.score, Math.min(100, a.score + 1));
        }
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ verse, score }) => ({ verse, score }));
  }

  /**
   * Sliding-window matching for LONG, NOISY transcripts (voice / Shazam
   * mode, spec 017). A 15-second recitation transcript spans several verses
   * and carries phonetic transcription errors; the standard path fails on it
   * twice over: containment needs near-exact substrings, and the spec-015
   * Fuse pattern cap only fuzzy-matches the first ~32 normalized chars —
   * garbled opening words doom the whole clip even when a later stretch is
   * nearly perfect.
   *
   * Instead: split the input into overlapping word windows, run each window
   * through the normal pipeline (containment + capped Fuse — the tuned
   * constants are untouched), and aggregate votes per verse across windows.
   * A verse's final score is its best window score plus a small bonus per
   * additional supporting window (capped), so verses corroborated by several
   * windows outrank one-window flukes.
   *
   * Costs windows×(normal search); callers should treat this as the
   * expensive path and use it for final transcripts only, never per
   * keystroke.
   */
  findTopMatchesWindowed(
    input: string,
    topN: number = 3,
    language: MatchLanguage = 'both',
    minScore: number = 20,
    windowWords: number = 8,
    strideWords: number = 4
  ): VerseMatch[] {
    const words = input.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    // Short inputs: the plain path already handles these well (and the
    // 32-char cap barely bites) — no need to pay for windowing.
    if (words.length <= windowWords) {
      return this.findTopMatches(input, topN, language, minScore);
    }

    const windows: string[] = [];
    for (let start = 0; start < words.length; start += strideWords) {
      windows.push(words.slice(start, start + windowWords).join(' '));
      if (start + windowWords >= words.length) break;
    }
    // The whole transcript is one more "window": full-string containment
    // still catches clean multi-verse captures in a single shot.
    windows.push(input);

    const votes = new Map<string, { verse: VerseMatch['verse']; best: number; support: number }>();
    for (const w of windows) {
      // Per-window minScore of 1: weak window hits still contribute votes;
      // the caller-facing minScore is applied to aggregated results below.
      const hits = this.findTopMatches(w, topN, language, 1);
      for (const hit of hits) {
        const key = `${hit.verse.surah}:${hit.verse.ayah}`;
        const v = votes.get(key);
        if (!v) {
          votes.set(key, { verse: hit.verse, best: hit.score, support: 1 });
        } else {
          v.best = Math.max(v.best, hit.score);
          v.support += 1;
        }
      }
    }

    const aggregated: VerseMatch[] = Array.from(votes.values()).map((v) => ({
      verse: v.verse,
      // +4 per extra supporting window, capped at +12; clamp to 100.
      score: Math.min(100, v.best + Math.min(3, v.support - 1) * 4),
    }));

    return aggregated
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
}
