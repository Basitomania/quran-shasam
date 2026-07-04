/**
 * Recitation-transcript eval gate (spec 017 Phase 0).
 *
 * Scores Whisper transcripts of reciter clips through the REAL fuzzy matcher
 * (VerseMatcher over all 6,236 verses — pure JS, no ONNX). Transcripts are
 * produced laptop-side by model-pipeline/eval_whisper.py; this suite is a
 * measurement instrument, not a CI gate.
 *
 * SKIPPED unless RECITATION_TRANSCRIPTS points to a transcripts JSON:
 *   RECITATION_TRANSCRIPTS=../model-pipeline/eval_results/transcripts_base-q8_0.json \
 *     npx jest --selectProjects regression -t recitation
 *
 * Reports per-clip top-1/top-3 hits and a summary line. The only hard
 * assertion is that the transcripts file parses and is non-empty — hit-rate
 * thresholds are judged in the spec-017 Phase 0 gate, not here.
 */
import * as fs from 'fs';
import * as path from 'path';
import { VerseMatcher } from '../../src/services/verseMatcher';
import { QuranVerse } from '../../src/types/quran';

interface VerseIndexEntry {
  s: number;
  a: number;
  sn: string;
  sa: string;
  ar: string;
  en: string;
  t: string;
}

interface TranscriptRow {
  clip: string;
  truth: string;
  transcript: string;
  seconds?: number;
}

const transcriptsEnv = process.env.RECITATION_TRANSCRIPTS;
const describeIf = transcriptsEnv ? describe : describe.skip;

describeIf('recitation transcript eval (spec 017 Phase 0)', () => {
  jest.setTimeout(120000);

  it('reports top-1/top-3 verse hit-rate through the real matcher', () => {
    const transcriptsPath = path.resolve(transcriptsEnv as string);
    const rows = JSON.parse(
      fs.readFileSync(transcriptsPath, 'utf8')
    ) as TranscriptRow[];
    expect(rows.length).toBeGreaterThan(0);

    const verseIndex = require('../../assets/verse_index.json') as VerseIndexEntry[];
    const verses: QuranVerse[] = verseIndex.map((v) => ({
      surah: v.s,
      ayah: v.a,
      surahNameEnglish: v.sn,
      surahNameArabic: v.sa,
      arabicText: v.ar,
      englishText: v.en,
    }));
    const matcher = new VerseMatcher(verses);

    // Truth may be a single ref ("2:255") or a recited RANGE ("78:8-11") for
    // multi-verse user clips — any verse inside the range counts as a hit.
    const inTruth = (ref: string, truth: string): boolean => {
      const [ts, ta] = truth.split(':');
      const [rs, ra] = ref.split(':');
      if (rs !== ts) return false;
      if (!ta.includes('-')) return ra === ta;
      const [lo, hi] = ta.split('-').map(Number);
      const a = Number(ra);
      return a >= lo && a <= hi;
    };

    // RECITATION_WINDOWED=1 routes through the sliding-window voice path
    // (spec 017) instead of the standard matcher.
    const windowed = process.env.RECITATION_WINDOWED === '1';

    let top1 = 0;
    let top3 = 0;
    for (const row of rows) {
      const matches = windowed
        ? matcher.findTopMatchesWindowed(row.transcript, 3, 'arabic', 1)
        : matcher.findTopMatches(row.transcript, 3, 'arabic', 1);
      const refs = matches.map((m) => `${m.verse.surah}:${m.verse.ayah}`);
      const hitTop1 = refs.length > 0 && inTruth(refs[0], row.truth);
      const hitTop3 = refs.some((r) => inTruth(r, row.truth));
      if (hitTop1) top1 += 1;
      if (hitTop3) top3 += 1;
      const status = hitTop1 ? 'top-1' : hitTop3 ? 'top-3' : 'MISS ';
      console.log(
        `  ${status} ${row.clip} truth=${row.truth} got=[${refs.join(', ')}]`
      );
    }
    console.log(
      `RECITATION EVAL ${path.basename(transcriptsPath)}: ` +
        `top-1 ${top1}/${rows.length}, top-3 ${top3}/${rows.length}`
    );
  });
});
