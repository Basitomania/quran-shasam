import { formatVerseForShare } from '../formatVerse';
import { QuranVerse } from '../../types/quran';

const BASE: QuranVerse = {
  surah: 1,
  ayah: 1,
  surahNameEnglish: 'Al-Faatiha',
  surahNameArabic: 'سُورَةُ ٱلْفَاتِحَةِ',
  arabicText: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
  englishText: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
};

describe('formatVerseForShare', () => {
  it('joins arabic, english, and attribution with blank lines', () => {
    const out = formatVerseForShare(BASE);
    expect(out.split('\n\n')).toHaveLength(3);
    expect(out).toContain(BASE.arabicText);
    expect(out).toContain(BASE.englishText);
  });

  it('uses an em-dash attribution line: — <SurahName> <surah>:<ayah>', () => {
    const out = formatVerseForShare(BASE);
    const last = out.split('\n\n').pop();
    expect(last).toBe('— Al-Faatiha 1:1');
  });

  it('omits the english block when translation is missing — no dangling blank line', () => {
    const out = formatVerseForShare({ ...BASE, englishText: '' });
    expect(out.split('\n\n')).toHaveLength(2);
    expect(out).not.toContain('\n\n\n');
  });

  it('treats whitespace-only english as missing', () => {
    const out = formatVerseForShare({ ...BASE, englishText: '   ' });
    expect(out.split('\n\n')).toHaveLength(2);
  });

  it('trims surrounding whitespace from the arabic text', () => {
    const out = formatVerseForShare({ ...BASE, arabicText: `  ${BASE.arabicText}  ` });
    expect(out.startsWith(BASE.arabicText)).toBe(true);
  });

  // Public-facing share format — a snapshot pins the exact layout so any
  // change is a deliberate, reviewed decision.
  it('matches the pinned share layout', () => {
    expect(formatVerseForShare(BASE)).toMatchInlineSnapshot(`
"بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ

In the name of Allah, the Entirely Merciful, the Especially Merciful.

— Al-Faatiha 1:1"
`);
  });
});
