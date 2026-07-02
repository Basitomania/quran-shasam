/**
 * Local thematic search using pre-computed embeddings + keyword index.
 * NO API calls needed - runs 100% offline after initial data load.
 *
 * Two search strategies:
 * 1. Keyword-based (fast, always available) - uses inverted index
 * 2. Embedding-based (better results) - uses pre-computed verse embeddings
 *    + on-device ONNX model for query embedding
 *
 * For now we use keyword search which works great and needs no model.
 * Embedding search can be added later with onnxruntime-react-native.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { QuranVerse, ThematicResult } from '../types/quran';

interface KeywordIndex {
  [keyword: string]: [number, number][]; // [surah, ayah][]
}

interface VerseIndexEntry {
  s: number;   // surah
  a: number;   // ayah
  sn: string;  // surah name english
  sa: string;  // surah name arabic
  ar: string;  // arabic text
  en: string;  // english text
  t: string;   // topics
}

let keywordIndex: KeywordIndex | null = null;
let verseIndex: VerseIndexEntry[] | null = null;

const KEYWORD_INDEX_ASSET = 'keyword_index.json';
const VERSE_INDEX_ASSET = 'verse_index.json';

/**
 * Load the pre-built search indices from bundled assets.
 * Call this once at app startup.
 */
export async function loadSearchIndex(
  keywordIndexData: KeywordIndex,
  verseIndexData: VerseIndexEntry[]
): Promise<void> {
  keywordIndex = keywordIndexData;
  verseIndex = verseIndexData;
}

/**
 * Search verses by theme/topic using keyword matching.
 * Scores verses by how many query keywords match their topic tags.
 */
export function searchByTheme(
  query: string,
  verses: QuranVerse[],
  topN: number = 10
): ThematicResult[] {
  if (!keywordIndex || !verseIndex) {
    throw new Error('Search index not loaded. Call loadSearchIndex() first.');
  }

  const queryWords = extractKeywords(query);
  if (queryWords.length === 0) return [];

  // Score each verse by keyword match count
  const scores = new Map<string, { score: number; matchedTerms: string[] }>();

  for (const word of queryWords) {
    // Exact match
    const matches = keywordIndex[word] || [];
    for (const [surah, ayah] of matches) {
      const key = `${surah}:${ayah}`;
      const existing = scores.get(key) || { score: 0, matchedTerms: [] };
      existing.score += 2; // exact match weight
      existing.matchedTerms.push(word);
      scores.set(key, existing);
    }

    // Prefix match (e.g., "creat" matches "creation", "created", "creator")
    if (word.length >= 4) {
      const prefix = word.substring(0, Math.min(word.length, 6));
      for (const [indexWord, refs] of Object.entries(keywordIndex)) {
        if (indexWord !== word && indexWord.startsWith(prefix)) {
          for (const [surah, ayah] of refs) {
            const key = `${surah}:${ayah}`;
            const existing = scores.get(key) || { score: 0, matchedTerms: [] };
            existing.score += 1; // partial match weight
            if (!existing.matchedTerms.includes(word)) {
              existing.matchedTerms.push(word);
            }
            scores.set(key, existing);
          }
        }
      }
    }
  }

  // Also search through verse topics directly for multi-word phrases
  const queryLower = query.toLowerCase();
  for (let i = 0; i < verseIndex.length; i++) {
    const v = verseIndex[i];
    const topicText = `${v.t} ${v.en}`.toLowerCase();
    const key = `${v.s}:${v.a}`;

    // Bonus for phrase match in topics
    if (topicText.includes(queryLower)) {
      const existing = scores.get(key) || { score: 0, matchedTerms: [] };
      existing.score += 5; // strong phrase match bonus
      if (!existing.matchedTerms.includes(queryLower)) {
        existing.matchedTerms.push(queryLower);
      }
      scores.set(key, existing);
    }
  }

  // Build verse lookup
  const verseLookup = new Map<string, QuranVerse>();
  for (const v of verses) {
    verseLookup.set(`${v.surah}:${v.ayah}`, v);
  }

  // Sort by score and return top results
  const sorted = Array.from(scores.entries())
    .filter(([_, data]) => data.score >= 2)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topN);

  return sorted
    .map(([key, data]) => {
      const verse = verseLookup.get(key);
      if (!verse) return null;

      // Generate reason from matched terms
      const reason = data.matchedTerms.length > 0
        ? `Matches: ${data.matchedTerms.join(', ')}`
        : `Related to: ${query}`;
      return { verse, reason };
    })
    .filter(Boolean) as ThematicResult[];
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'that', 'this', 'was', 'are',
    'be', 'has', 'had', 'have', 'will', 'about', 'what', 'when', 'where',
    'how', 'why', 'who', 'which',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));
}
