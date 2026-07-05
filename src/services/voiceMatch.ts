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
import { normalizeArabic } from './arabicNormalizer';

/** Below this top-score the plain result set is considered weak. */
export const VOICE_WEAK_SCORE = 60;
/** Above this word count the windowed pass always runs. */
export const VOICE_WINDOWED_MIN_WORDS = 15;
/**
 * Score assigned to semantic-only merges. MUST stay below any real fuzzy
 * hit that could plausibly be correct: a device repro (98:1 recitation,
 * 2026-07-04) showed the correct verse at fuzzy score 30 being buried
 * under semantic junk carrying the old nominal 50.
 */
export const SEMANTIC_MERGE_SCORE = 20;

/** Matches any Arabic-block character. */
const ARABIC_RE = /[؀-ۿ]/;

const BASMALA_NORMALIZED = normalizeArabic('بسم الله الرحمن الرحيم');
/** Basmala word count + minimum meaningful tail. */
const BASMALA_WORDS = 4;
const BASMALA_MIN_TAIL_WORDS = 3;

/**
 * Recitation-tuned Whisper likes to prepend the basmala whether or not it
 * was recited, and reciters open with it anyway — either way it is pure
 * noise for identification (it matches 1:1 and every surah-opening verse
 * equally). Strip it when enough transcript remains to identify a verse;
 * a basmala-only transcript is kept (the user may genuinely want 1:1).
 */
export function stripLeadingBasmala(transcript: string): string {
  const trimmed = transcript.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < BASMALA_WORDS + BASMALA_MIN_TAIL_WORDS) return trimmed;
  const head = normalizeArabic(words.slice(0, BASMALA_WORDS).join(' '));
  if (head !== BASMALA_NORMALIZED) return trimmed;
  return words.slice(BASMALA_WORDS).join(' ');
}

/**
 * Word-coverage confidence: the fraction of the transcript's normalized
 * words that appear in the verse (0-100). Fuse's edit-distance score
 * undersells a mostly-right Whisper transcript (device repro 2026-07-04:
 * 98:1 correctly ranked first but displayed at 48% because two garbled
 * words blocked containment); coverage reads "9 of 12 words are in this
 * verse" as 75. Junk matches riding on one or two shared words score low,
 * so it also widens the gap between the right verse and noise.
 */
export function coverageConfidence(transcript: string, verseArabic: string): number {
  const transcriptWords = normalizeArabic(transcript).split(' ').filter(Boolean);
  if (transcriptWords.length === 0) return 0;
  const verseWords = new Set(normalizeArabic(verseArabic).split(' ').filter(Boolean));
  const covered = transcriptWords.filter((w) => verseWords.has(w)).length;
  return Math.round((covered / transcriptWords.length) * 100);
}

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
  /**
   * Whisper-path scoring (spec 017 amendment): strip a leading basmala
   * before matching and lift each result's score to its word-coverage
   * confidence when that is higher than the fuzzy score. Leave unset for
   * OS transcripts, whose error model Fuse already fits.
   */
  coverageConfidence?: boolean;
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

  const trimmed = options.coverageConfidence
    ? stripLeadingBasmala(transcript)
    : transcript.trim();
  if (!trimmed) return [];

  // Rung 1: plain path.
  let results = matcher.findTopMatches(trimmed, topN, language, minScore);

  // Rung 2: windowed pass for weak or long transcripts (voice-path only).
  const wordCount = trimmed.split(/\s+/).length;
  if (topScore(results) < VOICE_WEAK_SCORE || wordCount > VOICE_WINDOWED_MIN_WORDS) {
    const windowed = matcher.findTopMatchesWindowed(trimmed, topN, language, minScore);
    results = betterOf(results, windowed);
  }

  // Rung 3: semantic merge when the fuzzy ladder is still weak — ENGLISH
  // transcripts only. The semantic bi-encoder embeds queries with an
  // English-trained model (MiniLM over translations+tags), so an Arabic
  // transcript produces noise embeddings and the merged "results" are
  // random verses. Device repro 2026-07-04: recited 98:1, fuzzy had it at
  // rank 2, semantic junk displaced it entirely.
  const isArabicTranscript = ARABIC_RE.test(trimmed);
  if (
    !isArabicTranscript &&
    topScore(results) < VOICE_WEAK_SCORE &&
    options.semanticSearch
  ) {
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

  // Whisper-path confidence lift: max(fuzzy, coverage) — coverage never
  // demotes a strong fuzzy/containment hit, only rescues undersold ones.
  if (options.coverageConfidence && results.length > 0) {
    results = results
      .map((m) => ({
        ...m,
        score: Math.max(m.score, coverageConfidence(trimmed, m.verse.arabicText)),
      }))
      .sort((a, b) => b.score - a.score);
  }

  return results;
}
