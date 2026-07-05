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

  it('weak ARABIC transcript never calls semantic (English-model mismatch guard)', async () => {
    // The semantic bi-encoder is English-trained; Arabic queries produce
    // noise embeddings. Device repro 2026-07-04: semantic junk at the old
    // nominal 50 buried the correct fuzzy hit (98:1@30).
    const m = stubMatcher([hit(1, 2, 30)], [hit(1, 2, 35), hit(2, 255, 25)]);
    const semantic = jest.fn(async () => [
      { verse: verse(24, 35), reason: 'noise' },
    ]);
    const results = await matchVoiceTranscript(m, 'نص ضعيف', 'arabic', {
      semanticSearch: semantic,
    });
    expect(semantic).not.toHaveBeenCalled();
    const keys = results.map((r) => `${r.verse.surah}:${r.verse.ayah}`);
    expect(keys).toEqual(['1:2', '2:255']);
  });

  it('weak ENGLISH transcript merges semantic BELOW real fuzzy hits', async () => {
    const m = stubMatcher([hit(1, 2, 30)], [hit(1, 2, 35), hit(2, 255, 25)]);
    const semantic = jest.fn(async () => [
      { verse: verse(1, 2), reason: 'dup — must dedupe' },
      { verse: verse(24, 35), reason: 'semantic-only' },
    ]);
    const results = await matchVoiceTranscript(m, 'weak english transcript', 'english', {
      semanticSearch: semantic,
    });
    expect(semantic).toHaveBeenCalledTimes(1);
    const keys = results.map((r) => `${r.verse.surah}:${r.verse.ayah}`);
    // Nominal semantic score (20) ranks below every plausible fuzzy hit.
    expect(keys).toEqual(['1:2', '2:255', '24:35']);
    expect(results[2].score).toBe(SEMANTIC_MERGE_SCORE);
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

  it('known-hard garbled ARABIC transcript does NOT get a fake semantic rescue', async () => {
    // Accepted residual: the garbled 24:35 clip stays unmatched rather than
    // surfacing English-model noise dressed up as a result.
    const semantic = jest.fn(async () => [
      { verse: verse(24, 35), reason: 'would be noise on real device' },
    ]);
    await matchVoiceTranscript(matcher, EVAL_TRANSCRIPTS.hard_24_35, 'arabic', {
      semanticSearch: semantic,
    });
    expect(semantic).not.toHaveBeenCalled();
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

// Spec 017 amendment (2026-07-04): Whisper-path scoring — basmala strip +
// word-coverage confidence. Device repro: 98:1 ranked first but displayed
// 48% (two garbled words blocked containment, Fuse undersold the rest);
// 1:1 rode into the results purely on a transcribed basmala prefix.
describe('whisper-path scoring (basmala strip + coverage confidence)', () => {
  const { stripLeadingBasmala, coverageConfidence } = jest.requireActual('../voiceMatch');

  const arabicHit = (surah: number, ayah: number, score: number, arabicText: string): VerseMatch => ({
    verse: { ...verse(surah, ayah), arabicText },
    score,
  });

  describe('stripLeadingBasmala', () => {
    it('strips a leading basmala when a meaningful tail remains (normalized compare)', () => {
      expect(
        stripLeadingBasmala('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ لم يكن الذين كفروا')
      ).toBe('لم يكن الذين كفروا');
    });

    it('keeps a basmala-only transcript (the user may want 1:1)', () => {
      const basmala = 'بسم الله الرحمن الرحيم';
      expect(stripLeadingBasmala(basmala)).toBe(basmala);
    });

    it('keeps the basmala when the tail is too short to identify a verse', () => {
      const t = 'بسم الله الرحمن الرحيم لم يكن';
      expect(stripLeadingBasmala(t)).toBe(t);
    });

    it('leaves non-basmala openings untouched', () => {
      const t = 'الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين';
      expect(stripLeadingBasmala(t)).toBe(t);
    });
  });

  describe('coverageConfidence', () => {
    it('is 100 when every transcript word appears in the verse', () => {
      expect(coverageConfidence('ٱلحمد لله', 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ')).toBe(100);
    });

    it('reads a mostly-right garbled transcript as its covered fraction', () => {
      // 4 of 6 words covered (كفروه/ءال are transcription errors) -> 67.
      expect(
        coverageConfidence('لم يكن الذين كفروه من ءال', 'لم يكن الذين كفروا من اهل الكتاب')
      ).toBe(67);
    });

    it('is low for a junk verse sharing only one word', () => {
      expect(coverageConfidence('لم يكن الذين كفروا', 'الرحمن الرحيم يكن')).toBe(25);
    });

    it('is 0 for an empty transcript', () => {
      expect(coverageConfidence('   ', 'نص')).toBe(0);
    });
  });

  describe('ladder integration (coverageConfidence option)', () => {
    // Verse text covering the whole transcript below; junk shares one word.
    const RIGHT_VERSE = 'لم يكن الذين كفروا من اهل الكتاب والمشركين منفكين';
    const JUNK_VERSE = 'قل هو الله احد ولم يكن له كفوا احد';
    const TRANSCRIPT = 'بسم الله الرحمن الرحيم لم يكن الذين كفروا من اهل الكتاب';

    it('strips the basmala before matching and lifts scores to coverage, re-sorting', async () => {
      // Fuzzy undersold the right verse below the junk hit.
      const m = stubMatcher(
        [arabicHit(112, 2, 55, JUNK_VERSE), arabicHit(98, 1, 48, RIGHT_VERSE)],
        []
      );
      const results = await matchVoiceTranscript(m, TRANSCRIPT, 'arabic', {
        coverageConfidence: true,
      });

      // Basmala stripped from the matcher input.
      expect(m.findTopMatches).toHaveBeenCalledWith(
        'لم يكن الذين كفروا من اهل الكتاب',
        5,
        'arabic',
        15
      );
      // Right verse: 7/7 words covered -> 100, outranks junk (max 55 vs coverage 14).
      expect(results.map((r) => `${r.verse.surah}:${r.verse.ayah}`)).toEqual(['98:1', '112:2']);
      expect(results[0].score).toBe(100);
      expect(results[1].score).toBe(55);
    });

    it('never demotes a hit whose fuzzy score beats its coverage', async () => {
      const m = stubMatcher([arabicHit(1, 2, 95, 'نص بلا تغطيه')], []);
      const results = await matchVoiceTranscript(m, 'الحمد لله رب العالمين', 'arabic', {
        coverageConfidence: true,
      });
      expect(results[0].score).toBe(95);
    });

    it('without the option, transcript and scores pass through unchanged', async () => {
      const m = stubMatcher([arabicHit(98, 1, 48, RIGHT_VERSE)], []);
      const results = await matchVoiceTranscript(m, TRANSCRIPT, 'arabic', {});
      expect(m.findTopMatches).toHaveBeenCalledWith(TRANSCRIPT, 5, 'arabic', 15);
      expect(results[0].score).toBe(48);
    });
  });
});
