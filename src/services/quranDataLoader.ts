import * as FileSystem from 'expo-file-system/legacy';
import { QuranVerse } from '../types/quran';

const DATA_FILE = `${FileSystem.documentDirectory}quran_data.json`;

export async function loadQuranData(
  onProgress?: (message: string) => void
): Promise<QuranVerse[]> {
  // Check cache
  const fileInfo = await FileSystem.getInfoAsync(DATA_FILE);
  if (fileInfo.exists) {
    onProgress?.('Loading from cache...');
    const json = await FileSystem.readAsStringAsync(DATA_FILE);
    const cached: QuranVerse[] = JSON.parse(json);
    if (cached.length > 0 && cached[0].englishText) {
      return cached;
    }
    onProgress?.('Cache outdated, re-downloading...');
  }

  onProgress?.('Downloading Arabic text...');
  const [arabicRes, englishRes] = await Promise.all([
    fetch('https://api.alquran.cloud/v1/quran/ar.alafasy'),
    fetch('https://api.alquran.cloud/v1/quran/en.sahih'),
  ]);

  onProgress?.('Parsing data...');
  const arabicData = await arabicRes.json();
  const englishData = await englishRes.json();

  const englishLookup: Record<string, string> = {};
  for (const surah of englishData.data.surahs) {
    for (const ayah of surah.ayahs) {
      englishLookup[`${surah.number}:${ayah.numberInSurah}`] = ayah.text;
    }
  }

  const verses: QuranVerse[] = [];
  const surahs = arabicData.data.surahs;

  for (const surah of surahs) {
    for (const ayah of surah.ayahs) {
      const key = `${surah.number}:${ayah.numberInSurah}`;
      verses.push({
        surah: surah.number,
        surahNameArabic: surah.name,
        surahNameEnglish: surah.englishName,
        ayah: ayah.numberInSurah,
        arabicText: ayah.text,
        englishText: englishLookup[key] || '',
      });
    }

    if (surah.number % 20 === 0) {
      onProgress?.(`Loading surahs ${surah.number}/114...`);
    }
  }

  onProgress?.('Caching data...');
  await FileSystem.writeAsStringAsync(DATA_FILE, JSON.stringify(verses));

  onProgress?.(`Loaded ${verses.length} verses`);
  return verses;
}
