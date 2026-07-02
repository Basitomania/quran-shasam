import { normalizeArabic, normalizeEnglish, containsArabic } from '../arabicNormalizer';

describe('normalizeArabic', () => {
  // The 10 marks stripped by the normalizer (DIACRITICS list in the module).
  const DIACRITICS: [string, string][] = [
    ['fathatan', 'ً'],
    ['dammatan', 'ٌ'],
    ['kasratan', 'ٍ'],
    ['fatha', 'َ'],
    ['damma', 'ُ'],
    ['kasra', 'ِ'],
    ['shadda', 'ّ'],
    ['sukun', 'ْ'],
    ['superscript alef', 'ٰ'],
    ['tatweel', 'ـ'],
  ];

  it.each(DIACRITICS)('strips %s', (_name, mark) => {
    expect(normalizeArabic(`ب${mark}سم`)).toBe('بسم');
  });

  it('strips all diacritics from a fully vocalized basmala', () => {
    expect(normalizeArabic('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ')).toBe('بسم الله الرحمن الرحيم');
  });

  it.each([
    ['alef with hamza below', 'إ'],
    ['alef with hamza above', 'أ'],
    ['alef with madda', 'آ'],
    ['alef wasla', 'ٱ'],
  ])('collapses %s to bare alef', (_name, alef) => {
    expect(normalizeArabic(`${alef}ب`)).toBe('اب');
  });

  it('collapses taa marbuta to haa', () => {
    expect(normalizeArabic('رحمة')).toBe('رحمه');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(normalizeArabic('  بسم   الله \n الرحمن\t')).toBe('بسم الله الرحمن');
  });

  it('returns empty string for empty and whitespace-only input', () => {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic('   \n\t ')).toBe('');
  });

  it('leaves non-Arabic text unchanged apart from whitespace', () => {
    expect(normalizeArabic('hello   world')).toBe('hello world');
  });
});

describe('normalizeEnglish', () => {
  it('lowercases', () => {
    expect(normalizeEnglish('In The NAME of Allah')).toBe('in the name of allah');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeEnglish('  praise   be\nto\tAllah ')).toBe('praise be to allah');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeEnglish(' \n ')).toBe('');
  });
});

describe('containsArabic', () => {
  it('detects pure Arabic', () => {
    expect(containsArabic('بسم الله')).toBe(true);
  });

  it('detects Arabic mixed with Latin', () => {
    expect(containsArabic('surah البقرة')).toBe(true);
  });

  it('rejects pure Latin', () => {
    expect(containsArabic('bismillah')).toBe(false);
  });

  it('rejects digits, punctuation, and empty input', () => {
    expect(containsArabic('123 !?')).toBe(false);
    expect(containsArabic('')).toBe(false);
  });
});
