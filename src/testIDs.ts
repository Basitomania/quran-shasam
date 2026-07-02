/**
 * Central registry of testID values.
 *
 * Convention: <screen>.<element>[.<qualifier>], dot-separated, camelCase
 * segments. Used by component tests (RNTL) and Maestro e2e flows — change a
 * value here and both layers follow; never inline a testID string in a
 * component.
 *
 * Dynamic IDs (per-verse) are functions.
 */
export const testIDs = {
  tabs: {
    text: 'tab.text',
    voice: 'tab.voice',
    themes: 'tab.themes',
    saved: 'tab.saved',
  },
  loading: {
    screen: 'loading.screen',
    retry: 'loading.retry',
  },
  textSearch: {
    input: 'textSearch.input',
    clear: 'textSearch.clear',
    results: 'textSearch.results',
    languageBadge: 'textSearch.languageBadge',
  },
  voice: {
    micButton: 'voice.micButton',
    languageArabic: 'voice.language.arabic',
    languageEnglish: 'voice.language.english',
    transcript: 'voice.transcript',
    results: 'voice.results',
  },
  themes: {
    input: 'themes.input',
    searchButton: 'themes.searchButton',
    backButton: 'themes.backButton',
    results: 'themes.results',
    modeAI: 'themes.mode.ai',
    modeKeyword: 'themes.mode.keyword',
    exampleChip: (index: number) => `themes.example.${index}`,
  },
  saved: {
    list: 'saved.list',
    emptyState: 'saved.emptyState',
  },
  verseCard: {
    card: (surah: number, ayah: number) => `verseCard.${surah}:${ayah}`,
    bookmark: (surah: number, ayah: number) => `verseCard.${surah}:${ayah}.bookmark`,
    copy: (surah: number, ayah: number) => `verseCard.${surah}:${ayah}.copy`,
    share: (surah: number, ayah: number) => `verseCard.${surah}:${ayah}.share`,
  },
} as const;
