import { QuranVerse, ThematicResult } from '../types/quran';

const SYSTEM_PROMPT = `You are a Quran scholar assistant. Given a thematic query, return the most relevant verses from the Holy Quran.

Return ONLY a JSON array of objects with these fields:
- "surah": surah number (1-114)
- "ayah": ayah number
- "reason": brief explanation of why this verse is relevant (1 sentence)

Return between 3 and 15 verses, ordered by relevance. Be accurate with surah and ayah numbers.

Example response:
[{"surah":2,"ayah":30,"reason":"Allah tells the angels He will place a successor on earth"},{"surah":2,"ayah":31,"reason":"Allah taught Adam the names of all things"}]

Return ONLY the JSON array, no other text.`;

export async function thematicSearch(
  query: string,
  verses: QuranVerse[],
  apiKey: string
): Promise<ThematicResult[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Find Quran verses related to: ${query}` },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const responseText =
    data.content?.[0]?.text || '';

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const references: { surah: number; ayah: number; reason: string }[] =
    JSON.parse(jsonMatch[0]);

  const verseLookup = new Map<string, QuranVerse>();
  for (const v of verses) {
    verseLookup.set(`${v.surah}:${v.ayah}`, v);
  }

  return references
    .map((ref) => {
      const verse = verseLookup.get(`${ref.surah}:${ref.ayah}`);
      if (!verse) return null;
      return { verse, reason: ref.reason };
    })
    .filter(Boolean) as ThematicResult[];
}
