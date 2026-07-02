import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  message: string;
  error?: string | null;
  onRetry?: () => void;
}

export function LoadingScreen({ message, error, onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quran Shasam</Text>
      <Text style={styles.subtitle}>Quran Verse Detector</Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {onRetry ? (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <ActivityIndicator
            size="large"
            color={colors.accent}
            style={styles.spinner}
          />
          <Text style={styles.message}>{message}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 48,
  },
  spinner: {
    marginBottom: 24,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.error,
    marginTop: 32,
    alignItems: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  retryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
