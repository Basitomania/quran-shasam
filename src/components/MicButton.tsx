import React, { useEffect, useMemo, useRef } from 'react';
import {
  TouchableOpacity,
  View,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export type MicMode = 'idle' | 'listening' | 'busy';

interface Props {
  /**
   * idle: mic glyph, no ring. listening: stop glyph, pulse, progress ring.
   * busy: spinner (transcribing/matching) — taps are the caller's concern.
   */
  mode: MicMode;
  /**
   * Session progress 0-1 driving the countdown ring (spec 018). Owned by the
   * caller (one Animated.timing over the session budget). Ring renders only
   * while listening.
   */
  progress?: Animated.Value;
  /**
   * While listening: whether a stop tap would be honored (spec 018
   * MIN_STOP_MS gate). When false the stop glyph renders dimmed so the
   * button doesn't promise a stop it will ignore. Defaults to true.
   */
  stopEnabled?: boolean;
  onPress: () => void;
  testID?: string;
}

// Ring geometry: sits between the 88pt button and the 100pt pulse circle.
const RING_SIZE = 100;
const RING_THICKNESS = 4;
const RING_HALF = RING_SIZE / 2;

/**
 * Countdown ring without SVG (spec 018: no new deps): the classic
 * two-half-circle rotating-border trick. Each half of the ring is a
 * half-width window (overflow: hidden) containing a full circle whose border
 * is colored on one semicircle only (two adjacent border sides). Rotating
 * the colored semicircle into the window sweeps an arc clockwise from
 * 12 o'clock: the right window covers progress 0-0.5, the left 0.5-1.
 */
function ProgressRing({ progress }: { progress: Animated.Value }) {
  const { firstRotate, secondRotate } = useMemo(
    () => ({
      // Colored LEFT semicircle (borderTop+borderLeft, base -45deg) rotating
      // into the right window over progress 0 -> 0.5.
      firstRotate: progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['-45deg', '135deg', '135deg'],
      }),
      // Colored RIGHT semicircle (borderTop+borderRight, base +45deg)
      // rotating into the left window over progress 0.5 -> 1.
      secondRotate: progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['45deg', '45deg', '225deg'],
      }),
    }),
    [progress]
  );

  return (
    <View pointerEvents="none" style={ringStyles.container}>
      <View style={ringStyles.track} />
      <View style={[ringStyles.window, ringStyles.windowRight]}>
        <Animated.View
          style={[
            ringStyles.arc,
            ringStyles.arcInRightWindow,
            {
              borderTopColor: colors.accent,
              borderLeftColor: colors.accent,
              transform: [{ rotate: firstRotate }],
            },
          ]}
        />
      </View>
      <View style={[ringStyles.window, ringStyles.windowLeft]}>
        <Animated.View
          style={[
            ringStyles.arc,
            ringStyles.arcInLeftWindow,
            {
              borderTopColor: colors.accent,
              borderRightColor: colors.accent,
              transform: [{ rotate: secondRotate }],
            },
          ]}
        />
      </View>
    </View>
  );
}

export function MicButton({ mode, progress, stopEnabled = true, onPress, testID }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;
  const isListening = mode === 'listening';

  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.3,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.6);
    }
  }, [isListening]);

  const accessibilityLabel =
    mode === 'listening'
      ? 'Stop and search'
      : mode === 'busy'
        ? 'Searching'
        : 'Start listening';

  return (
    <View style={styles.container}>
      {isListening && (
        <Animated.View
          style={[
            styles.pulse,
            {
              transform: [{ scale: pulseAnim }],
              opacity: opacityAnim,
            },
          ]}
        />
      )}
      {isListening && progress ? <ProgressRing progress={progress} /> : null}
      <TouchableOpacity
        style={[
          styles.button,
          isListening && styles.buttonActive,
        ]}
        onPress={onPress}
        activeOpacity={0.8}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: mode === 'busy' }}
      >
        {mode === 'busy' ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : (
          <Ionicons
            name={isListening ? 'stop' : 'mic-outline'}
            size={40}
            color={isListening ? '#FFF' : colors.accent}
            style={isListening && !stopEnabled ? { opacity: 0.35 } : undefined}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
  },
  track: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_THICKNESS,
    borderColor: colors.border,
  },
  window: {
    position: 'absolute',
    top: 0,
    width: RING_HALF,
    height: RING_SIZE,
    overflow: 'hidden',
  },
  windowRight: {
    right: 0,
  },
  windowLeft: {
    left: 0,
  },
  arc: {
    position: 'absolute',
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_THICKNESS,
    borderColor: 'transparent',
  },
  // Circle centered on the container center = the window's clipping edge.
  arcInRightWindow: {
    left: -RING_HALF,
  },
  arcInLeftWindow: {
    left: 0,
  },
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 120,
  },
  pulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.error,
  },
  button: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
});
