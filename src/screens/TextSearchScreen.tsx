import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuranData } from '../context/QuranContext';
import { VerseCard } from '../components/VerseCard';
import { containsArabic } from '../services/arabicNormalizer';
import { VerseMatch } from '../types/quran';
import { colors } from '../theme/colors';

export function TextSearchScreen() {
  const { matcher } = useQuranData();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VerseMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);

      if (timerRef.current) clearTimeout(timerRef.current);

      if (!text.trim() || !matcher) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      timerRef.current = setTimeout(() => {
        const language = containsArabic(text) ? 'arabic' : 'english';
        const matches = matcher.findTopMatches(text, 5, language);
        setResults(matches);
        setHasSearched(true);
      }, 300);
    },
    [matcher]
  );

  const isArabic = containsArabic(query);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.searchBox}>
        <TextInput
          style={[
            styles.input,
            isArabic && styles.inputArabic,
          ]}
          placeholder="Type Arabic or English verse text..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Text style={styles.langBadge}>
            {isArabic ? 'AR' : 'EN'}
          </Text>
        )}
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => handleSearch('')}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {!hasSearched && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>Search</Text>
          <Text style={styles.placeholderText}>
            Type or paste text from the Quran{'\n'}in Arabic or English to
            identify the verse
          </Text>
          <Text style={styles.exampleLabel}>Examples:</Text>
          <Text style={styles.example}>
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </Text>
          <Text style={styles.example}>
            In the name of Allah, the Entirely Merciful
          </Text>
        </View>
      )}

      {hasSearched && results.length === 0 && (
        <View style={styles.placeholder}>
          <Text style={styles.noResults}>
            No matching verse found.{'\n'}Try a longer or more accurate text.
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.verse.surah}:${item.verse.ayah}`}
        renderItem={({ item }) => (
          <VerseCard verse={item.verse} score={item.score} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 14,
  },
  inputArabic: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  langBadge: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    marginLeft: 8,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 2,
  },
  list: {
    paddingBottom: 32,
  },
  placeholder: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  placeholderIcon: {
    fontSize: 20,
    color: colors.textMuted,
    marginBottom: 16,
    fontWeight: '600',
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  exampleLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  example: {
    color: colors.accent,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.7,
  },
  noResults: {
    color: colors.confidenceMedium,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
