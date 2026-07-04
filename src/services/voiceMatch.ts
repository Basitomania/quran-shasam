/**
 * Voice-transcript match ladder (spec 017 Phase 1).
 *
 * Voice transcripts differ from typed queries: they are longer (a 15 s
 * recitation spans several verses) and carry phonetic transcription errors.
 * The plain matcher path fails on them twice over (containment needs
 * near-exact substrings; the spec-015 Fuse cap only fuzzy-matches the first
 * ~32 normalized chars). The ladder:
 *
 *   1. Plain `findTopMatches` — cheap, wins on clean short transcripts.
 *   2. If the best score is weak (< VOICE_WEAK_SCORE) OR the transcript is
 *      long (> VOICE_WINDOWED_MIN_WORDS words), also run
 *      `findTopMatchesWindowed` and keep whichever result set is stronger.
 *      Windowing is VOICE-PATH ONLY by spec-017 decision — the text-search
 *      path never uses it.
 *   3. If still weak and semantic search is available, run the transcript
 *      through it and merge/dedupe (semantic-only hits join with a nominal
 *      score; the merged set is re-sorted by score).
 *
 * Pure orchestration over injected functions — unit-testable with the
 * Phase 0 eval transcripts as fixtures.
 */

import { VerseMatch, MatchLanguage, ThematicResult } from '../types/quran';

/** Below this top-score the plain result set is considered weak. */
export const VOICE_WEAK_SCORE = 60;
/** Above this word count the windowed pass always runs. */
export const VOICE_WINDOWED_MIN_WORDS = 15;
/** Score assigned to semantic-only merges (real fuzzy scores rank above). */
export const SEMANTIC_MERGE_SCORE = 50;

export interface VoiceMatcher {
  findTopMatches(
    input: string,
    topN?: number,
    language?: MatchLanguage,
    minScore?: number
  ): VerseMatch[];
  findTopMatchesWindowed(
    input: string,
    topN?: number,
    language?: MatchLanguage,
    minScore?: number
  ): VerseMatch[];
}

export interface VoiceMatchOptions {
  topN?: number;
  minScore?: number;
  /** Provided only when semantic search is initialized and ready. */
  semanticSearch?: (query: string) => Promise<ThematicResult[]>;
}

function topScore(matches: VerseMatch[]): number {
  return matches.length > 0 ? matches[0].score : 0;
}

/** Higher top score wins; tie broken by more results. */
function betterOf(a: VerseMatch[], b: VerseMatch[]): VerseMatch[] {
  if (topScore(b) > topScore(a)) return b;
  if (topScore(b) === topScore(a) && b.length > a.length) return b;
  return a;
}

export async function matchVoiceTranscript(
  matcher: VoiceMatcher,
  transcript: string,
  language: MatchLanguage,
  options: VoiceMatchOptions = {}
): Promise<VerseMatch[]> {
  const topN = options.topN ?? 5;
  const minScore = options.minScore ?? 15;

  const trimmed = transcript.trim();
  if (!trimmed) return [];

  // Rung 1: plain path.
  let results = matcher.findTopMatches(trimmed, topN, language, minScore);

  // Rung 2: windowed pass for weak or long transcripts (voice-path only).
  const wordCount = trimmed.split(/\s+/).length;
  if (topScore(results) < VOICE_WEAK_SCORE || wordCount > VOICE_WINDOWED_MIN_WORDS) {
    const windowed = matcher.findTopMatchesWindowed(trimmed, topN, language, minScore);
    results = betterOf(results, windowed);
  }

  // Rung 3: semantic merge when the fuzzy ladder is still weak.
  if (topScore(results) < VOICE_WEAK_SCORE && options.semanticSearch) {
    try {
      const semantic = await options.semanticSearch(trimmed);
      const seen = new Set(results.map((m) => `${m.verse.surah}:${m.verse.ayah}`));
      for (const s of semantic) {
        const key = `${s.verse.surah}:${s.verse.ayah}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ verse: s.verse, score: SEMANTIC_MERGE_SCORE });
      }
      results = results.sort((a, b) => b.score - a.score).slice(0, topN);
    } catch (err: any) {
      // Semantic is best-effort here — keep whatever the fuzzy ladder found.
      console.warn('[VoiceMatch] Semantic merge failed:', err?.message ?? String(err));
    }
  }

  return results;
}
