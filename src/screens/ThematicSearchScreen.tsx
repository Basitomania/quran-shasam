import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { useQuranData } from '../context/QuranContext';
import { VerseCard } from '../components/VerseCard';
import { searchByTheme } from '../services/localThematicSearch';
import { semanticSearch, isSemanticReady } from '../services/semanticSearch';
import { ThematicResult } from '../types/quran';
import { colors } from '../theme/colors';
import { testIDs } from '../testIDs';

const EXAMPLE_QUERIES = [
  'Creation of Adam',
  'Story of Sulaiman',
  'Patience in hardship',
  'Day of Judgment',
  'Mercy of Allah',
  'Rights of parents',
  'Story of Musa and Pharaoh',
  'Paradise description',
  'Prayer and worship',
  'Forgiveness',
];

export function ThematicSearchScreen() {
  const { verses, searchReady, semanticReady } = useQuranData();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ThematicResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'ai' | 'keyword'>('ai');
  const [usedMode, setUsedMode] = useState<'ai' | 'keyword'>('keyword');

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  const [sanityRunning, setSanityRunning] = useState(false);

  // Dev-only: run the specs-012/013 sanity suite through the live pipeline.
  const handleRunSanity = async () => {
    if (sanityRunning) return;
    setSanityRunning(true);
    try {
      const { runSearchSanity } = await import('../dev/searchSanity');
      const suite = await runSearchSanity(verses);
      const failures = suite.results
        .filter((r) => !r.pass)
        .map((r) => `"${r.query}" got [${r.top3.join(', ')}]`)
        .join('\n');
      Alert.alert(
        `Sanity: ${suite.passed}/${suite.total} (rerank ${suite.rerankActive ? 'ON' : 'OFF'})`,
        `${Math.round(suite.totalMs / 1000)}s total, avg ${Math.round(suite.totalMs / suite.total)}ms/query` +
          (failures ? `\n\nFailed:\n${failures}` : '\n\nAll passed.')
      );
    } catch (err: any) {
      Alert.alert('Sanity run failed', String(err?.message ?? err));
    } finally {
      setSanityRunning(false);
    }
  };

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    Keyboard.dismiss();
    setHasSearched(true);
    setIsSearching(true);

    try {
      let res: ThematicResult[];
      const useAI = searchMode === 'ai' && semanticReady;

      if (useAI) {
        res = await semanticSearch(q, verses);
        setUsedMode('ai');
      } else {
        res = searchByTheme(q, verses, 50);
        setUsedMode('keyword');
      }

      setResults(res);
    } catch (err) {
      console.warn('Search failed, falling back to keyword:', err);
      const res = searchByTheme(q, verses, 50);
      setResults(res);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.topBar}>
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>
            100% offline - no API costs
          </Text>
        </View>
        {__DEV__ && (
          <TouchableOpacity
            style={styles.sanityBtn}
            onPress={handleRunSanity}
            disabled={sanityRunning || !semanticReady}
          >
            <Text style={styles.sanityBtnText}>
              {sanityRunning ? 'Running sanity suite…' : 'Run sanity suite (dev)'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, searchMode === 'ai' && styles.modeBtnActive]}
            onPress={() => setSearchMode('ai')}
            testID={testIDs.themes.modeAI}
          >
            <Text style={[styles.modeText, searchMode === 'ai' && styles.modeTextActive]}>
              AI Search {semanticReady ? '✓' : '⏳'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, searchMode === 'keyword' && styles.modeBtnActive]}
            onPress={() => setSearchMode('keyword')}
            testID={testIDs.themes.modeKeyword}
          >
            <Text style={[styles.modeText, searchMode === 'keyword' && styles.modeTextActive]}>
              Keyword
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search by theme, story, topic..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => handleSearch()}
          testID={testIDs.themes.input}
        />
        <TouchableOpacity
          style={[styles.searchBtn, isSearching && styles.searchBtnDisabled]}
          onPress={() => handleSearch()}
          disabled={isSearching}
          testID={testIDs.themes.searchButton}
        >
          <Text style={styles.searchBtnText}>
            {isSearching ? '...' : 'Search'}
          </Text>
        </TouchableOpacity>
      </View>

      {isSearching && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      )}

      {!hasSearched && !isSearching && (
        <View style={styles.examplesBox}>
          <Text style={styles.examplesTitle}>Try searching for:</Text>
          <View style={styles.chips}>
            {EXAMPLE_QUERIES.map((q, index) => (
              <TouchableOpacity
                key={q}
                style={styles.chip}
                onPress={() => {
                  setQuery(q);
                  handleSearch(q);
                }}
                testID={testIDs.themes.exampleChip(index)}
              >
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {hasSearched && !isSearching && results.length === 0 && (
        <View style={styles.noResultsBox}>
          <Text style={styles.noResults}>
            No relevant verses found. Try rephrasing your query.
          </Text>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            testID={testIDs.themes.backButton}
          >
            <Text style={styles.clearBtnText}>← Back to topics</Text>
          </TouchableOpacity>
        </View>
      )}

      {hasSearched && !isSearching && results.length > 0 && (
        <View style={styles.resultHeader}>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            testID={testIDs.themes.backButton}
          >
            <Text style={styles.clearBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.resultCount}>
            Found {results.length} verse{results.length !== 1 ? 's' : ''} ({usedMode === 'ai' ? 'AI' : 'keyword'})
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.verse.surah}:${item.verse.ayah}`}
        renderItem={({ item }) => (
          <VerseCard verse={item.verse} reason={item.reason} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        testID={testIDs.themes.results}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 8,
  },
  offlineBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  offlineBadgeText: {
    color: colors.confidenceHigh,
    fontSize: 11,
    fontWeight: '600',
  },
  sanityBtn: {
    alignSelf: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  sanityBtnText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtnActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  modeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  modeTextActive: {
    color: colors.text,
  },
  searchRow: {
    flexDirection: 'row',
    margin: 16,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  searchBtnDisabled: {
    opacity: 0.6,
  },
  searchBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  examplesBox: {
    padding: 16,
    paddingTop: 8,
  },
  examplesTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.accent,
    fontSize: 13,
  },
  noResultsBox: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  noResults: {
    color: colors.confidenceMedium,
    fontSize: 15,
    textAlign: 'center',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  resultCount: {
    color: colors.textMuted,
    fontSize: 13,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    paddingBottom: 32,
  },
});
