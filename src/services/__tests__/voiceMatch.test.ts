/**
 * Voice-match ladder tests (spec 017 Phase 1).
 *
 * Two layers:
 *  - ladder mechanics against a stub matcher (which rungs run, and when);
 *  - end-to-end rows through the REAL VerseMatcher over the small fixture,
 *    using transcripts copied from the Phase 0 user-voice eval
 *    (model-pipeline/eval_results/user_transcripts_tiny-mixnorm-q5_1.json —
 *    gitignored, hence copied inline).
 */
import { VerseMatcher } from '../verseMatcher';
import {
  matchVoiceTranscript,
  VOICE_WEAK_SCORE,
  VOICE_WINDOWED_MIN_WORDS,
  SEMANTIC_MERGE_SCORE,
  VoiceMatcher,
} from '../voiceMatch';
import { FIXTURE_VERSES } from '../../../test/fixtures/verses.small';
import { QuranVerse, VerseMatch } from '../../types/quran';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

const verse = (surah: number, ayah: number): QuranVerse => ({
  surah,
  ayah,
  surahNameEnglish: 's',
  surahNameArabic: 'س',
  arabicText: 'نص',
  englishText: 'text',
});

const hit = (surah: number, ayah: number, score: number): VerseMatch => ({
  verse: verse(surah, ayah),
  score,
});

function stubMatcher(plain: VerseMatch[], windowed: VerseMatch[]) {
  return {
    findTopMatches: jest.fn(() => plain.map((m) => ({ ...m }))),
    findTopMatchesWindowed: jest.fn(() => windowed.map((m) => ({ ...m }))),
  } satisfies VoiceMatcher & Record<string, jest.Mock>;
}

// Phase 0 eval transcripts (tiny-mixnorm-q5_1, user-voice set) — inline
// copies; the source JSON is a gitignored eval artifact.
const EVAL_TRANSCRIPTS = {
  // User_1_1-3.wav (truth 1:1-3): clean transcript, resolves via containment.
  clean_1_2: 'ٱلحمد لله رب ٱلعلمين',
  // User_78_8-11.wav (truth 78:8-11): phonetic near-misses throughout.
  garbled_78: 'وجعلناكم أزوجا وجعلنا له مكم شباتا وجعلنا ليلا ٱلبسا وجعلنا له ماشا',
  // User_18_1-2.wav (truth 18:1-2): long garbled multi-verse transcript
  // (>15 words — always engages the windowed rung).
  long_18: 'ٱلحمد لله ٱلذى أنزل على أبى ٱلكتب ولم يجعل له ذى وجه قيما لينذر بشى شديدا من نده ويبشر ٱلمؤمنين ٱلذين يحملون ٱلصلحى',
  // User_24_35.wav (truth 24:35): garbled beyond fuzzy rescue — the
  // known-hard residual; semantic is this row's only chance.
  hard_24_35: 'ٱلله نغوص موت وٱلأرض مسلمون كمسكت فى مسبه ٱلمسبه فى سجاجة ذجاجة ٱلكهن ما توكى قدودإنه يدى ٱلله ٱلدني من يشآء ويضرب ٱلله ٱلأمس على ٱلناس وٱلله بكل شىء عليم',
};

describe('ladder mechanics (stub matcher)', () => {
  it('returns [] for empty/whitespace transcripts without touching the matcher', async () => {
    const m = stubMatcher([], []);
    expect(await matchVoiceTranscript(m, '   ', 'arabic')).toEqual([]);
    expect(m.findTopMatches).not.toHaveBeenCalled();
    expect(m.findTopMatchesWindowed).not.toHaveBeenCalled();
  });

  it('strong short transcript: plain rung only, no windowing', async () => {
    const m = stubMatcher([hit(1, 2, 95)], []);
    const results = await matchVoiceTranscript(m, 'الحمد لله رب العالمين', 'arabic');
    expect(results).toEqual([hit(1, 2, 95)]);
    expect(m.findTopMatchesWindowed).not.toHaveBeenCalled();
  });

  it('weak plain score engages the windowed rung and keeps the better set', async () => {
    const m = stubMatcher([hit(1, 2, VOICE_WEAK_SCORE - 10)], [hit(85, 4, 90)]);
    const results = await matchVoiceTranscript(m, 'کلمات قليلة', 'arabic');
    expect(m.findTopMatchesWindowed).toHaveBeenCalledTimes(1);
    expect(results).toEqual([hit(85, 4, 90)]);
  });

  it('long transcript (> VOICE_WINDOWED_MIN_WORDS words) engages windowing even when plain is strong', async () => {
    const words = Array.from({ length: VOICE_WINDOWED_MIN_WORDS + 1 }, (_, i) => `كلمة${i}`);
    const m = stubMatcher([hit(1, 2, 95)], [hit(1, 2, 80)]);
    const results = await matchVoiceTranscript(m, words.join(' '), 'arabic');
    expect(m.findTopMatchesWindowed).toHaveBeenCalledTimes(1);
    // Plain set is stronger — it wins.
    expect(results).toEqual([hit(1, 2, 95)]);
  });

  it('still-weak results trigger the semantic merge with dedupe and nominal scores', async () => {
    const m = stubMatcher([hit(1, 2, 30)], [hit(1, 2, 35), hit(2, 255, 25)]);
    const semantic = jest.fn(async () => [
      { verse: verse(1, 2), reason: 'dup — must dedupe' },
      { verse: verse(24, 35), reason: 'semantic-only' },
    ]);
    const results = await matchVoiceTranscript(m, 'نص ضعيف', 'arabic', {
      semanticSearch: semantic,
    });
    expect(semantic).toHaveBeenCalledTimes(1);
    const keys = results.map((r) => `${r.verse.surah}:${r.verse.ayah}`);
    expect(keys).toEqual(['24:35', '1:2', '2:255']); // 50 > 35 > 25, no dup 1:2
    expect(results[0].score).toBe(SEMANTIC_MERGE_SCORE);
  });

  it('does not call semantic when the fuzzy ladder is already strong', async () => {
    const m = stubMatcher([hit(1, 2, VOICE_WEAK_SCORE + 5)], []);
    const semantic = jest.fn(async () => []);
    await matchVoiceTranscript(m, 'نص قوى', 'arabic', { semanticSearch: semantic });
    expect(semantic).not.toHaveBeenCalled();
  });

  it('semantic failure is swallowed — fuzzy results are kept', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const m = stubMatcher([hit(1, 2, 30)], []);
    const semantic = jest.fn(async () => {
      throw new Error('onnx blew up');
    });
    const results = await matchVoiceTranscript(m, 'نص', 'arabic', {
      semanticSearch: semantic,
    });
    expect(results).toEqual([hit(1, 2, 30)]);
  });
});

describe('eval transcripts through the real matcher (fixture corpus)', () => {
  let matcher: VerseMatcher;

  beforeAll(() => {
    matcher = new VerseMatcher(FIXTURE_VERSES);
  });

  it('clean transcript resolves 1:2 top-1 via the plain rung', async () => {
    const results = await matchVoiceTranscript(matcher, EVAL_TRANSCRIPTS.clean_1_2, 'arabic');
    expect(results.length).toBeGreaterThan(0);
    expect(`${results[0].verse.surah}:${results[0].verse.ayah}`).toBe('1:2');
  });

  it('long garbled multi-verse transcript engages windowing and completes', async () => {
    const windowedSpy = jest.spyOn(matcher, 'findTopMatchesWindowed');
    const results = await matchVoiceTranscript(matcher, EVAL_TRANSCRIPTS.long_18, 'arabic');
    expect(windowedSpy).toHaveBeenCalledTimes(1);
    expect(Array.isArray(results)).toBe(true);
    windowedSpy.mockRestore();
  });

  it('known-hard garbled transcript falls through to semantic and surfaces its result', async () => {
    const semantic = jest.fn(async () => [
      { verse: verse(24, 35), reason: 'semantic rescue' },
    ]);
    const results = await matchVoiceTranscript(matcher, EVAL_TRANSCRIPTS.hard_24_35, 'arabic', {
      semanticSearch: semantic,
    });
    expect(semantic).toHaveBeenCalledTimes(1);
    const keys = results.map((r) => `${r.verse.surah}:${r.verse.ayah}`);
    expect(keys).toContain('24:35');
  });

  it('garbled short transcript stays within topN and minScore contract', async () => {
    const results = await matchVoiceTranscript(matcher, EVAL_TRANSCRIPTS.garbled_78, 'arabic', {
      topN: 5,
      minScore: 15,
    });
    expect(results.length).toBeLessThanOrEqual(5);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(15);
    }
  });
});
