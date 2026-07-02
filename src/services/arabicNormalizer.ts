const DIACRITICS = [
  '\u064B', '\u064C', '\u064D', '\u064E', '\u064F',
  '\u0650', '\u0651', '\u0652', '\u0670', '\u0640',
];

const DIACRITICS_SET = new Set(DIACRITICS);

export function normalizeArabic(text: string): string {
  let result = '';
  for (const char of text) {
    if (!DIACRITICS_SET.has(char)) {
      result += char;
    }
  }

  result = result
    .replace(/إ/g, 'ا')
    .replace(/أ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/ٱ/g, 'ا')
    .replace(/ة/g, 'ه');

  return result.split(/\s+/).filter(Boolean).join(' ').trim();
}

export function normalizeEnglish(text: string): string {
  return text.toLowerCase().split(/\s+/).filter(Boolean).join(' ').trim();
}

export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}
