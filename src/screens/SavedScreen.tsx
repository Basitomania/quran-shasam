import React, { useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { VerseCard } from '../components/VerseCard';
import { useBookmarks } from '../context/BookmarksContext';
import { useQuranData } from '../context/QuranContext';
import { colors } from '../theme/colors';
import { QuranVerse } from '../types/quran';
import { Bookmark } from '../services/bookmarks';
import { testIDs } from '../testIDs';

interface Row {
  bookmark: Bookmark;
  verse: QuranVerse;
}

export function SavedScreen() {
  const { bookmarks, ready, removeBookmark } = useBookmarks();
  const { verses } = useQuranData();
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const rows = useMemo<Row[]>(() => {
    if (!verses.length) return [];
    // Build a lookup once per verses change.
    const byKey = new Map<string, QuranVerse>();
    for (const v of verses) {
      byKey.set(`${v.surah}:${v.ayah}`, v);
    }
    const result: Row[] = [];
    for (const b of bookmarks) {
      const v = byKey.get(`${b.surah}:${b.ayah}`);
      if (v) result.push({ bookmark: b, verse: v });
    }
    return result;
  }, [bookmarks, verses]);

  const confirmDelete = useCallback(
    (bookmark: Bookmark) => {
      const key = `${bookmark.surah}:${bookmark.ayah}`;
      Alert.alert(
        'Remove bookmark?',
        `Remove ${bookmark.surah}:${bookmark.ayah} from your saved verses?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              swipeRefs.current.get(key)?.close();
            },
          },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              removeBookmark(bookmark.surah, bookmark.ayah);
            },
          },
        ]
      );
    },
    [removeBookmark]
  );

  const renderRightActions = useCallback(
    (bookmark: Bookmark) => () => (
      <Pressable
        onPress={() => confirmDelete(bookmark)}
        style={styles.deleteAction}
        accessibilityRole="button"
        accessibilityLabel="Remove bookmark"
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.deleteActionText}>Remove</Text>
      </Pressable>
    ),
    [confirmDelete]
  );

  if (!ready) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Loading saved verses...</Text>
        </View>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.centered} testID={testIDs.saved.emptyState}>
          <Ionicons
            name="bookmark-outline"
            size={72}
            color={colors.textMuted}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle}>No saved verses yet</Text>
          <Text style={styles.emptyBody}>
            Tap the bookmark icon on any verse to save it.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.bookmark.surah}:${item.bookmark.ayah}`}
        contentContainerStyle={styles.listContent}
        testID={testIDs.saved.list}
        renderItem={({ item }) => {
          const key = `${item.bookmark.surah}:${item.bookmark.ayah}`;
          return (
            <Swipeable
              ref={(ref) => {
                swipeRefs.current.set(key, ref);
              }}
              renderRightActions={renderRightActions(item.bookmark)}
              overshootRight={false}
            >
              <VerseCard verse={item.verse} />
            </Swipeable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 96,
    marginVertical: 8,
    marginRight: 16,
    borderRadius: 16,
    flexDirection: 'column',
    gap: 2,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
