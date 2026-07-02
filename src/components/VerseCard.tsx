import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ToastAndroid,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { QuranVerse } from '../types/quran';
import { colors } from '../theme/colors';
import { useBookmarks } from '../context/BookmarksContext';
import { formatVerseForShare } from '../utils/formatVerse';

interface Props {
  verse: QuranVerse;
  score?: number;
  reason?: string;
}

export function VerseCard({ verse, score, reason }: Props) {
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const saved = isBookmarked(verse.surah, verse.ayah);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against double-fire when user long-presses the Copy action button:
  // outer card onLongPress (400ms) would fire, then on release the inner
  // button onPress would also fire. This ref collapses both into one invocation.
  const copyingRef = useRef(false);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    []
  );

  const confidenceColor =
    score === undefined
      ? colors.textMuted
      : score >= 80
        ? colors.confidenceHigh
        : score >= 60
          ? colors.confidenceMedium
          : colors.confidenceLow;

  const showToast = useCallback((msg: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedback(msg);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1200);
    }
  }, []);

  const onToggleBookmark = async () => {
    if (pending) return;
    setPending(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const result = await toggleBookmark(verse.surah, verse.ayah);
      showToast(result === 'added' ? 'Saved' : 'Removed');
    } finally {
      setPending(false);
    }
  };

  const handleCopy = useCallback(async () => {
    if (copyingRef.current) return;
    copyingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Clipboard.setStringAsync(formatVerseForShare(verse));
      showToast('Copied to clipboard');
    } catch {
      showToast('Copy failed');
    } finally {
      // Release the guard after the long-press → tap window closes.
      setTimeout(() => {
        copyingRef.current = false;
      }, 300);
    }
  }, [verse, showToast]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({ message: formatVerseForShare(verse) });
    } catch {
      // User cancelled or share failed — silent is fine, matches platform convention.
    }
  }, [verse]);

  return (
    <Pressable
      onLongPress={handleCopy}
      delayLongPress={400}
      accessibilityRole="text"
      accessibilityHint="Long press to copy verse"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <View style={styles.surahInfo}>
          <Text style={styles.surahEnglish}>{verse.surahNameEnglish}</Text>
          <Text style={styles.surahArabic}>{verse.surahNameArabic}</Text>
        </View>
        <View style={styles.reference}>
          <Text style={styles.referenceText}>
            {verse.surah}:{verse.ayah}
          </Text>
          {score !== undefined && (
            <View
              style={[styles.badge, { backgroundColor: confidenceColor }]}
            >
              <Text style={styles.badgeText}>{score}%</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.arabicText}>{verse.arabicText}</Text>

      {verse.englishText ? (
        <>
          <View style={styles.dividerLight} />
          <Text style={styles.englishText}>{verse.englishText}</Text>
        </>
      ) : null}

      {reason ? (
        <>
          <View style={styles.dividerLight} />
          <Text style={styles.reasonText}>{reason}</Text>
        </>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          onPress={handleCopy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Copy verse"
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <Ionicons
            name="copy-outline"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={handleShare}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Share verse"
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <Ionicons
            name="share-outline"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={onToggleBookmark}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove bookmark' : 'Save verse'}
          accessibilityState={{ selected: saved }}
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={saved ? colors.accent : colors.textSecondary}
          />
        </Pressable>
      </View>

      {feedback ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{feedback}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  surahInfo: {
    flex: 1,
  },
  surahEnglish: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  surahArabic: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  reference: {
    alignItems: 'flex-end',
  },
  referenceText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  badgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  dividerLight: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
    opacity: 0.5,
  },
  arabicText: {
    color: colors.arabic,
    fontSize: 22,
    lineHeight: 38,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontWeight: '400',
  },
  englishText: {
    color: colors.english,
    fontSize: 15,
    lineHeight: 24,
  },
  reasonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  actionBtnPressed: {
    opacity: 0.5,
  },
  toast: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: colors.surfaceLight,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 13,
    overflow: 'hidden',
  },
});
