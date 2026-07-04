import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
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

export function VoiceSearchScreen() {
  const { matcher, verses, semanticReady } = useQuranData();
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
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
  // Cancellation flag: async whisper processing must not setState after unmount.
  const mountedRef = useRef(true);

  const clearMaxSessionTimer = () => {
    if (maxSessionTimerRef.current) {
      clearTimeout(maxSessionTimerRef.current);
      maxSessionTimerRef.current = null;
    }
  };

  // Shared final step: run the matcher on a transcript and show the results.
  // No processedRef guard here — callers own the process-once contract.
  const runMatch = useCallback((text: string) => {
    setPartialText('');
    setRecognizedText(text);
    console.log('[Voice] Processing transcript:', text);
    if (matcher && text.trim()) {
      const matchLang = language === 'ar-SA' ? 'arabic' : 'english';
      const matches = matcher.findTopMatches(text, 5, matchLang, 15);
      console.log('[Voice] Matches found:', matches.length);
      setResults(matches);
    }
  }, [matcher, language]);

  const processTranscript = useCallback((text: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    runMatch(text);
  }, [runMatch]);

  // Spec 017: Whisper path for Arabic sessions. Transcribes the persisted
  // session WAV with the on-device recitation model, then runs the voice
  // match ladder (plain -> windowed -> semantic merge). Falls back to the
  // OS-recognizer transcript on any failure. Runs exactly once per session
  // (processedRef), like processTranscript.
  const processWhisperSession = useCallback(async (wavUri: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    setIsTranscribing(true);
    try {
      const transcript = await transcribeRecitation(wavUri);
      if (!mountedRef.current) return;
      if (!transcript.trim()) {
        // Whisper heard nothing usable — fall back to the OS transcript.
        runMatch(latestTextRef.current);
        return;
      }
      setPartialText('');
      setRecognizedText(transcript);
      console.log('[Voice] Whisper transcript:', transcript);
      if (matcher) {
        const matches = await matchVoiceTranscript(matcher, transcript, 'arabic', {
          topN: 5,
          minScore: 15,
          semanticSearch: semanticReady
            ? (query) => semanticSearch(query, verses, 5)
            : undefined,
        });
        if (!mountedRef.current) return;
        console.log('[Voice] Whisper matches found:', matches.length);
        setResults(matches);
      }
    } catch (err: any) {
      console.warn('[Voice] Whisper transcription failed, using OS transcript:', err?.message ?? String(err));
      if (!mountedRef.current) return;
      runMatch(latestTextRef.current);
    } finally {
      if (mountedRef.current) setIsTranscribing(false);
    }
  }, [matcher, runMatch, semanticReady, verses]);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
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
    setIsListening(false);
    clearMaxSessionTimer();
    // Single processing path: process whatever we have when the session ends.
    if (whisperSessionRef.current && recordingUriRef.current) {
      // Arabic Whisper route — transcribe the recorded WAV. Falls back to
      // the OS transcript internally on failure.
      processWhisperSession(recordingUriRef.current);
    } else if (latestTextRef.current.trim()) {
      processTranscript(latestTextRef.current);
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
    // "no-speech" is normal if user didn't say anything yet
    if (msg !== 'no-speech') {
      Alert.alert('Speech Error', msg);
    }
    setIsListening(false);
  });

  const toggleListening = useCallback(async () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
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
  }, [isListening, language]);

  const toggleLanguage = () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
    }
    setLanguage((prev) => (prev === 'ar-SA' ? 'en-US' : 'ar-SA'));
    setResults([]);
    setPartialText('');
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
          isListening={isListening}
          onPress={toggleListening}
          testID={testIDs.voice.micButton}
        />
        <Text style={styles.statusText}>
          {isListening
            ? 'Listening...'
            : isTranscribing
              ? 'Recognizing recitation...'
              : 'Tap to start listening'}
        </Text>
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
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
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
