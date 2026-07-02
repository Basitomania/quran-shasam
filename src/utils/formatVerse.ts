import { QuranVerse } from '../types/quran';

/**
 * Formats a verse for clipboard/share:
 *
 *   {Arabic text}
 *
 *   {English translation}
 *
 *   — {Surah English Name} {surah}:{ayah}
 *
 * If a translation is missing the English block is omitted so we never
 * leave a dangling blank line.
 */
export function formatVerseForShare(verse: QuranVerse): string {
  const parts: string[] = [verse.arabicText.trim()];

  const english = verse.englishText?.trim();
  if (english) {
    parts.push(english);
  }

  parts.push(`\u2014 ${verse.surahNameEnglish} ${verse.surah}:${verse.ayah}`);

  return parts.join('\n\n');
}
