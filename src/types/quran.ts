export interface QuranVerse {
  surah: number;
  surahNameArabic: string;
  surahNameEnglish: string;
  ayah: number;
  arabicText: string;
  englishText: string;
}

export type MatchLanguage = 'arabic' | 'english' | 'both';

export interface VerseMatch {
  verse: QuranVerse;
  score: number;
}

export interface ThematicResult {
  verse: QuranVerse;
  reason: string;
}
