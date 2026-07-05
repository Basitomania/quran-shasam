import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useQuranData } from '../context/QuranContext';
import { VerseCard } from '../components/VerseCard';
import { MicButton } from '../components/MicButton';
import { VerseMatch } from '../types/quran';
import { colors } from '../theme/colors';
import { testIDs } from '../testIDs';
import { isRecitationReady, transcribeRecitation } from '../services/recitationTranscriber';
import { matchVoiceTranscript } from '../services/voiceMatch';
import { semanticSearch } from '../services/semanticSearch';

type Language = 'ar-SA' | 'en-US';

// Spec 018: single source of truth for what the session UI shows. Derived
// from the same spec-011 event flow as before — the handlers only swap
// boolean setters for phase transitions; session SEMANTICS are unchanged.
type SessionPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'matching'
  | 'results'
  | 'no-match';

const STATUS_TEXT: Record<SessionPhase, string> = {
  idle: 'Tap to start listening',
  listening: 'Listening... tap to search',
  transcribing: 'Recognizing recitation...',
  matching: 'Finding the verse...',
  results: 'Tap to start listening',
  'no-match': 'No matching verse found',
};

/** 7 -> "0:07" — mm:ss for the session budget label. */
function formatSessionClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceSearchScreen() {
  const { matcher, verses, semanticReady } = useQuranData();
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('idle');
  const isListening = sessionPhase === 'listening';
  // Elapsed whole seconds while listening, for the "0:07 / 0:15" label.
  const [elapsedSec, setElapsedSec] = useState(0);
  const [partialText, setPartialText] = useState('');
  const [results, setResults] = useState<VerseMatch[]>([]);
  const [language, setLanguage] = useState<Language>('ar-SA');
  const [recognizedText, setRecognizedText] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    // Check if speech recognition is available on this device
    try {
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      setDebugInfo(`Available: ${available} | On-device: ${onDevice}`);
    } catch (err: any) {
      setDebugInfo(`Check failed: ${err?.message}`);
    }
  }, []);

  // Hard safety cap: if no `speechend` and no user stop within MAX_SESSION_MS
  // of the recognizer starting, we force-stop. This prevents continuous-mode
  // sessions from piling up audio buffers and matcher calls indefinitely
  // (previous 1.5s text-debounce was too aggressive and didn't stop the mic).
  const MAX_SESSION_MS = 15000;
  // Minimum recording before a manual stop is honored: Whisper needs a few
  // seconds of context to transcribe reliably, so early taps are ignored
  // and the status line counts down instead. Silence auto-stop (spec 011)
  // is NOT gated — the OS may still end a quiet session sooner.
  const MIN_STOP_MS = 5000;
  const maxSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTextRef = useRef('');
  // Guards against processing the same transcript twice (e.g. isFinal result
  // + end event both trying to run a search).
  const processedRef = useRef(false);
  // Spec 017: Arabic sessions route through the on-device Whisper transcriber
  // when it is ready and the OS can persist the session audio. Decided once
  // per session at start(); mid-session state changes don't flip the route.
  const whisperSessionRef = useRef(false);
  // file:// URI of the persisted session WAV, from the audioend event.
  const recordingUriRef = useRef<string | null>(null);
  // Session start timestamp for the manual-stop gate (MIN_STOP_MS).
  const sessionStartRef = useRef(0);
  // Set when the OS recognizer reports 'no-speech' for the session. A
  // recitation-fine-tuned Whisper HALLUCINATES verse text on silent/noisy
  // audio (its prior is pure Quran), so a silent session must never reach
  // the transcriber — the OS recognizer's speech detection is the gate.
  const noSpeechRef = useRef(false);
  // Cancellation flag: async whisper processing must not setState after unmount.
  const mountedRef = useRef(true);
  // Spec 018: ring progress 0-1 over MAX_SESSION_MS. One Animated.timing per
  // session (no polling); stopped and reset when the session ends.
  const progressAnim = useRef(new Animated.Value(0)).current;
  // 1s tick for the elapsed-seconds label; cleared on session end + unmount.
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearMaxSessionTimer = () => {
    if (maxSessionTimerRef.current) {
      clearTimeout(maxSessionTimerRef.current);
      maxSessionTimerRef.current = null;
    }
  };

  // Start/stop the purely-visual session indicators (ring + elapsed label).
  // Separate from the spec-011 timers on purpose: stopping visuals must never
  // affect session semantics.
  const startSessionVisuals = () => {
    setElapsedSec(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSec((s) => Math.min(s + 1, MAX_SESSION_MS / 1000));
    }, 1000);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: MAX_SESSION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  const stopSessionVisuals = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
  };

  // Shared final step: run the matcher on a transcript and show the results.
  // No processedRef guard here — callers own the process-once contract.
  const runMatch = useCallback((text: string) => {
    setPartialText('');
    setRecognizedText(text);
    console.log('[Voice] Processing transcript:', text);
    if (matcher && text.trim()) {
      // Synchronous matcher: 'matching' is momentary on this path (the OS
      // recognizer's "transcription stage" is instantaneous — spec 018).
      setSessionPhase('matching');
      const matchLang = language === 'ar-SA' ? 'arabic' : 'english';
      const matches = matcher.findTopMatches(text, 5, matchLang, 15);
      console.log('[Voice] Matches found:', matches.length);
      setResults(matches);
      setSessionPhase(matches.length > 0 ? 'results' : 'no-match');
    } else {
      setSessionPhase(text.trim() ? 'no-match' : 'idle');
    }
  }, [matcher, language]);

  const processTranscript = useCallback((text: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    runMatch(text);
  }, [runMatch]);

  // Spec 017 (amended 2026-07-04, user directive): Whisper is AUTHORITATIVE
  // for Arabic sessions. Transcribes the persisted session WAV with the
  // on-device recitation model, then runs the voice match ladder. On
  // failure/empty output it surfaces no-match — it never silently falls
  // back to the OS transcript (whose fuzzy matches masked Whisper handoff
  // bugs as low-confidence results). Runs exactly once per session
  // (processedRef), like processTranscript.
  const processWhisperSession = useCallback(async (wavUri: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    setSessionPhase('transcribing');
    try {
      const transcript = await transcribeRecitation(wavUri);
      if (!mountedRef.current) return;
      if (!transcript.trim()) {
        console.log('[Voice] engine=whisper: empty transcript — no-match');
        if (__DEV__) setDebugInfo('Engine: whisper | empty transcript');
        setSessionPhase('no-match');
        return;
      }
      setPartialText('');
      setRecognizedText(transcript);
      console.log('[Voice] engine=whisper transcript:', transcript);
      if (__DEV__) setDebugInfo('Engine: whisper');
      if (matcher) {
        // The ladder is async (semantic fallback) — keep 'matching' visible
        // around it (spec 018).
        setSessionPhase('matching');
        const matches = await matchVoiceTranscript(matcher, transcript, 'arabic', {
          topN: 5,
          minScore: 15,
          coverageConfidence: true,
          semanticSearch: semanticReady
            ? (query) => semanticSearch(query, verses, 5)
            : undefined,
        });
        if (!mountedRef.current) return;
        console.log(
          '[Voice] Whisper matches found:',
          matches.length,
          matches.map((m) => `${m.verse.surah}:${m.verse.ayah}=${m.score}`).join(' ')
        );
        setResults(matches);
        setSessionPhase(matches.length > 0 ? 'results' : 'no-match');
      } else {
        setSessionPhase('idle');
      }
    } catch (err: any) {
      console.warn('[Voice] engine=whisper: transcription failed — no-match:', err?.message ?? String(err));
      if (!mountedRef.current) return;
      if (__DEV__) setDebugInfo(`Engine: whisper | failed: ${err?.message ?? err}`);
      setSessionPhase('no-match');
    }
  }, [matcher, semanticReady, verses]);

  useSpeechRecognitionEvent('start', () => {
    sessionStartRef.current = Date.now();
    setSessionPhase('listening');
    startSessionVisuals();
    clearMaxSessionTimer();
    maxSessionTimerRef.current = setTimeout(() => {
      console.log('[Voice] Max session timeout reached — forcing stop');
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // no-op — `end` cleanup will still run
      }
    }, MAX_SESSION_MS);
  });

  // The persisted session WAV is announced on audioend (fires before end).
  useSpeechRecognitionEvent('audioend', (event) => {
    recordingUriRef.current = event?.uri ?? null;
  });

  useSpeechRecognitionEvent('end', () => {
    stopSessionVisuals();
    clearMaxSessionTimer();
    // Silence gate: the OS said no speech happened, so the recorded WAV is
    // silence/noise — feeding it to Whisper produces hallucinated verses.
    // Consume the session and show the no-match state instead.
    if (noSpeechRef.current && !latestTextRef.current.trim()) {
      if (!processedRef.current) {
        processedRef.current = true;
        setSessionPhase('no-match');
      }
      return;
    }
    // Single processing path: process whatever we have when the session ends.
    if (whisperSessionRef.current && recordingUriRef.current) {
      // Arabic Whisper route — authoritative; surfaces no-match on failure.
      processWhisperSession(recordingUriRef.current);
    } else if (whisperSessionRef.current) {
      // Whisper session but the recorded WAV never arrived (recording
      // handoff bug) — fail loudly instead of quietly matching the OS
      // transcript, so the handoff problem is visible, not masked as
      // low-confidence results.
      console.warn('[Voice] engine=whisper: session WAV missing — no-match');
      if (__DEV__) setDebugInfo('Engine: whisper | WAV missing (recording handoff)');
      if (!processedRef.current) {
        processedRef.current = true;
        setSessionPhase('no-match');
      }
    } else if (latestTextRef.current.trim()) {
      processTranscript(latestTextRef.current);
    } else if (!processedRef.current) {
      // Nothing to process this session — back to idle. (If a defensive
      // isFinal already processed, its phase stands.)
      setSessionPhase('idle');
    }
  });

  // System-level silence detection: fires when the recognizer thinks the
  // user has stopped speaking. We stop the mic here; the `end` event will
  // do the actual transcript processing. Silence threshold is controlled
  // by iOS/Android (typically ~1s after last speech).
  useSpeechRecognitionEvent('speechend', () => {
    console.log('[Voice] speechend — user stopped talking, stopping mic');
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // no-op
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript || '';
    latestTextRef.current = text;

    if (event.isFinal) {
      // Rare in continuous mode, but handle defensively. In a Whisper
      // session the OS transcript is only the fallback — `end` decides;
      // consuming the session here would race the recording.
      if (!whisperSessionRef.current) {
        processTranscript(text);
      }
      return;
    }

    setPartialText(text);
  });

  // Safety: clear timers on unmount and ensure recognizer is stopped.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearMaxSessionTimer();
      stopSessionVisuals();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // no-op
      }
    };
  }, []);

  useSpeechRecognitionEvent('error', (event) => {
    console.log('Speech recognition error:', JSON.stringify(event));
    const msg = event.error || 'Recognition failed';
    // "no-speech" is normal if user didn't say anything yet — flag it so the
    // `end` handler skips Whisper (silence hallucination gate) and routes to
    // the no-match state instead of idle.
    if (msg !== 'no-speech') {
      Alert.alert('Speech Error', msg);
      stopSessionVisuals();
      setSessionPhase('idle');
      return;
    }
    noSpeechRef.current = true;
    stopSessionVisuals();
  });

  const toggleListening = useCallback(async () => {
    if (isListening) {
      // Manual-stop gate: give Whisper enough audio context before honoring
      // a stop tap. The countdown in the status line shows the wait.
      if (Date.now() - sessionStartRef.current < MIN_STOP_MS) {
        return;
      }
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    // Spec 018: ignore taps while the previous session is still being
    // transcribed/matched — starting a new session here would reset
    // processedRef and race the in-flight async pipeline.
    if (sessionPhase === 'transcribing' || sessionPhase === 'matching') {
      return;
    }

    try {
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Microphone and Speech Recognition permissions are needed. Please enable them in Settings.'
        );
        return;
      }

      setResults([]);
      setPartialText('');
      setRecognizedText('');
      // Reset per-session guards so a fresh session can process again.
      processedRef.current = false;
      latestTextRef.current = '';
      recordingUriRef.current = null;
      noSpeechRef.current = false;

      // Spec 017: Arabic sessions use on-device Whisper when the transcriber
      // is ready and the OS can persist the session audio. Fallback ladder:
      // transcriber not ready/failed -> OS recognizer path (unchanged).
      let supportsRecording = false;
      try {
        supportsRecording = ExpoSpeechRecognitionModule.supportsRecording();
      } catch {
        // Older platform/module — treat as unsupported.
      }
      whisperSessionRef.current =
        language === 'ar-SA' && isRecitationReady() && supportsRecording;
      // Dev diagnostic: when an Arabic session can't use Whisper, say WHY —
      // this distinguishes "model still loading" from "recording unsupported"
      // on-device without log access.
      if (__DEV__ && language === 'ar-SA' && !whisperSessionRef.current) {
        setDebugInfo(
          `Engine: os — whisper skipped (ready=${isRecitationReady()}, recording=${supportsRecording})`
        );
      }

      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: true,
        continuous: true,
        ...(whisperSessionRef.current
          ? {
              recordingOptions: {
                persist: true,
                // whisper.cpp decodes 16 kHz PCM16 WAV. Android persists
                // that natively; iOS needs both options set explicitly.
                outputSampleRate: 16000,
                outputEncoding: 'pcmFormatInt16' as const,
              },
            }
          : null),
      });
    } catch (err: any) {
      Alert.alert(
        'Speech Recognition Error',
        err?.message || 'Failed to start speech recognition. Make sure you are on a real device (not a simulator).'
      );
    }
  }, [isListening, sessionPhase, language]);

  const toggleLanguage = () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
    }
    setLanguage((prev) => (prev === 'ar-SA' ? 'en-US' : 'ar-SA'));
    setResults([]);
    setPartialText('');
    setRecognizedText('');
    if (!isListening) {
      // Results were just cleared; drop any results/no-match phase. A live
      // session keeps its phase — stop() above triggers `end`, which owns
      // the transition (spec-011 flow unchanged).
      setSessionPhase('idle');
    }
  };

  // Spec 018: friendly no-match reset back to a fresh idle screen.
  const resetToIdle = () => {
    setResults([]);
    setPartialText('');
    setRecognizedText('');
    setSessionPhase('idle');
  };

  return (
    <View style={styles.container}>
      <View style={styles.languageRow}>
        <TouchableOpacity
          style={[
            styles.langBtn,
            language === 'ar-SA' && styles.langBtnActive,
          ]}
          onPress={() => {
            if (language !== 'ar-SA') toggleLanguage();
          }}
          testID={testIDs.voice.languageArabic}
        >
          <Text
            style={[
              styles.langText,
              language === 'ar-SA' && styles.langTextActive,
            ]}
          >
            Arabic
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.langBtn,
            language === 'en-US' && styles.langBtnActive,
          ]}
          onPress={() => {
            if (language !== 'en-US') toggleLanguage();
          }}
          testID={testIDs.voice.languageEnglish}
        >
          <Text
            style={[
              styles.langText,
              language === 'en-US' && styles.langTextActive,
            ]}
          >
            English
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.micArea}>
        <MicButton
          mode={
            isListening
              ? 'listening'
              : sessionPhase === 'transcribing' || sessionPhase === 'matching'
                ? 'busy'
                : 'idle'
          }
          progress={progressAnim}
          stopEnabled={elapsedSec >= MIN_STOP_MS / 1000}
          onPress={toggleListening}
          testID={testIDs.voice.micButton}
        />
        {isListening ? (
          <Text
            style={styles.progressText}
            testID={testIDs.voice.progress}
            accessibilityLabel={`${elapsedSec} of ${MAX_SESSION_MS / 1000} seconds`}
          >
            {`${formatSessionClock(elapsedSec)} / ${formatSessionClock(MAX_SESSION_MS / 1000)}`}
          </Text>
        ) : null}
        <View style={styles.statusRow}>
          {sessionPhase === 'transcribing' || sessionPhase === 'matching' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : null}
          <Text style={styles.statusText} testID={testIDs.voice.status}>
            {sessionPhase === 'listening' && elapsedSec < MIN_STOP_MS / 1000
              ? `Listening... keep going (${MIN_STOP_MS / 1000 - elapsedSec}s)`
              : STATUS_TEXT[sessionPhase]}
          </Text>
        </View>
        {sessionPhase === 'no-match' ? (
          <TouchableOpacity
            style={styles.tryAgainBtn}
            onPress={resetToIdle}
            testID={testIDs.voice.tryAgain}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.tryAgainText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
        {partialText ? (
          <Text
            style={styles.partialText}
            numberOfLines={2}
            testID={testIDs.voice.transcript}
          >
            {partialText}
          </Text>
        ) : null}
        {recognizedText ? (
          <Text style={styles.recognizedText}>
            Heard: "{recognizedText}"
          </Text>
        ) : null}
        {__DEV__ && debugInfo ? (
          <Text style={styles.debugText}>{debugInfo}</Text>
        ) : null}
        {__DEV__ ? (
          <TouchableOpacity
            style={styles.spikeBtn}
            testID="whisper-spike-button"
            onPress={async () => {
              // Spec 017 Phase 0 latency spike — lazy import so whisper.rn
              // never loads outside this dev-only tap.
              try {
                const { runWhisperSpike } = await import('../dev/whisperSpike');
                const r = await runWhisperSpike();
                Alert.alert(
                  'Whisper spike',
                  `model: ${r.modelName}\ninit: ${r.initMs} ms\n` +
                    `transcribe: ${r.transcribeMs} ms (${r.audioSec.toFixed(1)} s clip)\n` +
                    `RTF: ${r.rtf.toFixed(2)}\n\n${r.transcript.slice(0, 120)}`
                );
              } catch (err: any) {
                console.log(`[WhisperSpike] ERROR ${err?.message ?? err}`);
                Alert.alert('Whisper spike failed', err?.message ?? String(err));
              }
            }}
          >
            <Text style={styles.spikeBtnText}>Whisper spike (dev)</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.verse.surah}:${item.verse.ayah}`}
        renderItem={({ item }) => (
          <VerseCard verse={item.verse} score={item.score} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        testID={testIDs.voice.results}
        ListEmptyComponent={
          <Text style={styles.hint}>
            {language === 'ar-SA'
              ? 'Recite a verse from the Holy Quran'
              : 'Speak the English translation of a verse'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  langBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  langText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  langTextActive: {
    color: colors.text,
  },
  micArea: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  progressText: {
    color: colors.accent,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 10,
  },
  tryAgainBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  tryAgainText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  partialText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  list: {
    paddingBottom: 32,
  },
  recognizedText: {
    color: colors.accent,
    fontSize: 13,
    marginTop: 10,
    paddingHorizontal: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  spikeBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  spikeBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  debugText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 8,
    opacity: 0.6,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingTop: 16,
  },
});
