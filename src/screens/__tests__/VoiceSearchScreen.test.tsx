/**
 * VoiceSearchScreen tests — pins the spec-011 voice auto-stop behavior
 * (CLAUDE.md non-negotiable):
 *
 *   - `speechend` (system silence detection) stops the recognizer
 *   - transcript processing runs exactly once per session (processedRef)
 *   - 15s max-session safety cap, armed on `start`, cleared on `end`
 *   - language toggle mid-session stops the session
 *
 * `expo-speech-recognition` is mocked: event handlers registered via
 * useSpeechRecognitionEvent are captured into a map so tests can fire native
 * events manually.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

// Ionicons (via MicButton) loads its font asynchronously and setStates
// outside act — render a null stand-in to keep tests deterministic.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// Latest handler per event name, captured at render time.
const mockHandlers: Record<string, (event?: any) => void> = {};

jest.mock('expo-speech-recognition', () => ({
  useSpeechRecognitionEvent: (name: string, cb: (event?: any) => void) => {
    mockHandlers[name] = cb;
  },
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    isRecognitionAvailable: jest.fn(() => true),
    supportsOnDeviceRecognition: jest.fn(() => true),
    supportsRecording: jest.fn(() => true),
  },
}));

// Spec 017: Whisper transcriber + voice-match ladder + semantic search are
// mocked. Default: transcriber NOT ready — the pre-017 OS-recognizer tests
// below pin that unchanged fallback path.
const mockIsRecitationReady = jest.fn(() => false);
const mockTranscribeRecitation = jest.fn(async (_uri: string) => 'بسم الله');
jest.mock('../../services/recitationTranscriber', () => ({
  isRecitationReady: () => mockIsRecitationReady(),
  transcribeRecitation: (uri: string) => mockTranscribeRecitation(uri),
}));

const mockMatchVoiceTranscript = jest.fn(async (..._args: any[]): Promise<any[]> => []);
jest.mock('../../services/voiceMatch', () => ({
  matchVoiceTranscript: (...args: any[]) => mockMatchVoiceTranscript(...args),
}));

jest.mock('../../services/semanticSearch', () => ({
  semanticSearch: jest.fn(async () => []),
}));

const mockFindTopMatches = jest.fn(() => []);
jest.mock('../../context/QuranContext', () => ({
  useQuranData: () => ({
    verses: [],
    matcher: { findTopMatches: mockFindTopMatches },
    searchReady: true,
    semanticReady: false,
    isLoading: false,
    loadingMessage: '',
    error: null,
    retry: () => {},
  }),
}));

// VerseCard pulls clipboard/haptics/bookmarks — irrelevant here, and the
// mocked matcher returns no results anyway.
jest.mock('../../components/VerseCard', () => ({
  VerseCard: () => null,
}));

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { VoiceSearchScreen } from '../VoiceSearchScreen';
import { testIDs } from '../../testIDs';

const stopMock = ExpoSpeechRecognitionModule.stop as jest.Mock;

/** Fire a captured native speech event inside act(). */
function fireSpeechEvent(name: string, event?: any) {
  act(() => {
    mockHandlers[name]?.(event);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-pin defaults (clearAllMocks wipes calls, not one-off overrides).
  mockIsRecitationReady.mockImplementation(() => false);
  mockTranscribeRecitation.mockImplementation(async () => 'بسم الله');
  mockMatchVoiceTranscript.mockImplementation(async () => []);
  (ExpoSpeechRecognitionModule.supportsRecording as jest.Mock).mockImplementation(() => true);
  (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockImplementation(() =>
    Promise.resolve({ granted: true })
  );
  for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
});

afterEach(() => {
  jest.useRealTimers();
});

describe('speechend (system silence detection)', () => {
  it('stops the recognizer when speechend fires', () => {
    render(<VoiceSearchScreen />);
    expect(stopMock).not.toHaveBeenCalled();

    fireSpeechEvent('speechend');

    expect(stopMock).toHaveBeenCalledTimes(1);
  });
});

describe('processedRef dedupe (single processing path)', () => {
  it('processes the transcript exactly once when both a defensive isFinal result and end fire', () => {
    render(<VoiceSearchScreen />);

    fireSpeechEvent('result', {
      results: [{ transcript: 'bismillah' }],
      isFinal: true,
    });
    fireSpeechEvent('end');

    expect(mockFindTopMatches).toHaveBeenCalledTimes(1);
    expect(mockFindTopMatches).toHaveBeenCalledWith('bismillah', 5, 'arabic', 15);
  });

  it('processes once through the normal path: partial results then end', () => {
    render(<VoiceSearchScreen />);

    fireSpeechEvent('result', {
      results: [{ transcript: 'alhamdulillah' }],
      isFinal: false,
    });
    fireSpeechEvent('end');

    expect(mockFindTopMatches).toHaveBeenCalledTimes(1);
    expect(mockFindTopMatches).toHaveBeenCalledWith('alhamdulillah', 5, 'arabic', 15);
  });
});

describe('15s max-session safety cap', () => {
  it('force-stops the session 15s after start', () => {
    jest.useFakeTimers();
    render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    expect(stopMock).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('end clears the timer — no second stop after the cap window', () => {
    jest.useFakeTimers();
    render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    fireSpeechEvent('end');

    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(stopMock).not.toHaveBeenCalled();
  });
});

describe('language toggle', () => {
  it('stops the session when toggled while listening', () => {
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    fireEvent.press(getByTestId(testIDs.voice.languageEnglish));

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('does not stop anything when toggled while idle', () => {
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireEvent.press(getByTestId(testIDs.voice.languageEnglish));

    expect(stopMock).not.toHaveBeenCalled();
  });
});

describe('partial transcript', () => {
  it('streams non-final results into the transcript text', () => {
    const { getByTestId, queryByTestId } = render(<VoiceSearchScreen />);
    expect(queryByTestId(testIDs.voice.transcript)).toBeNull();

    fireSpeechEvent('result', {
      results: [{ transcript: 'iyyaka nabudu' }],
      isFinal: false,
    });

    expect(getByTestId(testIDs.voice.transcript).props.children).toBe('iyyaka nabudu');
  });
});

describe('spec 017 — Whisper recitation path (Arabic)', () => {
  const startMock = ExpoSpeechRecognitionModule.start as jest.Mock;

  /** Press the mic and flush the async permission request. */
  async function pressMic(getByTestId: (id: string) => any) {
    await act(async () => {
      fireEvent.press(getByTestId(testIDs.voice.micButton));
    });
  }

  it('starts with recordingOptions when the transcriber is ready (Arabic)', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0][0]).toMatchObject({
      lang: 'ar-SA',
      recordingOptions: {
        persist: true,
        outputSampleRate: 16000,
        outputEncoding: 'pcmFormatInt16',
      },
    });
  });

  it('starts WITHOUT recordingOptions when the transcriber is not ready (fallback ladder)', async () => {
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0][0].recordingOptions).toBeUndefined();
  });

  it('starts WITHOUT recordingOptions when recording persistence is unsupported', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    (ExpoSpeechRecognitionModule.supportsRecording as jest.Mock).mockImplementation(() => false);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);

    expect(startMock.mock.calls[0][0].recordingOptions).toBeUndefined();
  });

  it('English mode never uses the Whisper route even when ready', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireEvent.press(getByTestId(testIDs.voice.languageEnglish));
    await pressMic(getByTestId);

    expect(startMock.mock.calls[0][0]).toMatchObject({ lang: 'en-US' });
    expect(startMock.mock.calls[0][0].recordingOptions).toBeUndefined();

    fireSpeechEvent('result', { results: [{ transcript: 'say he is allah' }], isFinal: false });
    fireSpeechEvent('end');
    await act(async () => {});

    expect(mockTranscribeRecitation).not.toHaveBeenCalled();
    expect(mockFindTopMatches).toHaveBeenCalledWith('say he is allah', 5, 'english', 15);
  });

  it('transcribes the persisted WAV once and runs the match ladder', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    mockTranscribeRecitation.mockImplementation(async () => 'قل هو الله احد');
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'os garbage' }], isFinal: false });
    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    await act(async () => {});

    expect(mockTranscribeRecitation).toHaveBeenCalledTimes(1);
    expect(mockTranscribeRecitation).toHaveBeenCalledWith('file:///cache/recording.wav');
    expect(mockMatchVoiceTranscript).toHaveBeenCalledTimes(1);
    const [, transcript, language] = mockMatchVoiceTranscript.mock.calls[0] as any[];
    expect(transcript).toBe('قل هو الله احد');
    expect(language).toBe('arabic');
    // The OS transcript never reaches the plain matcher on the happy path.
    expect(mockFindTopMatches).not.toHaveBeenCalled();
  });

  it('processes exactly once when a defensive isFinal result races the end event', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'os text' }], isFinal: true });
    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    await act(async () => {});

    // isFinal must not consume the session via the OS path...
    expect(mockFindTopMatches).not.toHaveBeenCalled();
    // ...and the Whisper path runs exactly once.
    expect(mockTranscribeRecitation).toHaveBeenCalledTimes(1);
    expect(mockMatchVoiceTranscript).toHaveBeenCalledTimes(1);
  });

  // Amended 2026-07-04 (user directive): Whisper is authoritative for
  // Arabic sessions — failures surface as no-match, never as silent
  // OS-transcript matching (which masked recording-handoff bugs as
  // low-confidence results on device).
  it('whisper transcription failure surfaces no-match, never the OS transcript', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockIsRecitationReady.mockImplementation(() => true);
    mockTranscribeRecitation.mockImplementation(async () => {
      throw new Error('decode failed');
    });
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'النص الاحتياطى' }], isFinal: false });
    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    await act(async () => {});

    expect(mockFindTopMatches).not.toHaveBeenCalled();
    expect(mockMatchVoiceTranscript).not.toHaveBeenCalled();
    expect(getByTestId(testIDs.voice.tryAgain)).toBeTruthy();
  });

  it('empty whisper transcript surfaces no-match, never the OS transcript', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    mockTranscribeRecitation.mockImplementation(async () => '   ');
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'نص من النظام' }], isFinal: false });
    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    await act(async () => {});

    expect(mockFindTopMatches).not.toHaveBeenCalled();
    expect(getByTestId(testIDs.voice.tryAgain)).toBeTruthy();
  });

  it('missing recording uri in a Whisper session surfaces no-match (handoff bug is loud)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'نص عادى' }], isFinal: false });
    fireSpeechEvent('end'); // no audioend/uri
    await act(async () => {});

    expect(mockTranscribeRecitation).not.toHaveBeenCalled();
    expect(mockFindTopMatches).not.toHaveBeenCalled();
    expect(getByTestId(testIDs.voice.tryAgain)).toBeTruthy();
  });

  it('15s max-session cap still force-stops a Whisper session', async () => {
    jest.useFakeTimers();
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('language toggle mid-session still stops a Whisper session', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireEvent.press(getByTestId(testIDs.voice.languageEnglish));

    expect(stopMock).toHaveBeenCalledTimes(1);
  });
});

describe('error handling', () => {
  it('does not surface an alert for no-speech', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<VoiceSearchScreen />);

    fireSpeechEvent('error', { error: 'no-speech' });

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('surfaces an alert for other error codes', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<VoiceSearchScreen />);

    fireSpeechEvent('error', { error: 'network' });

    expect(alertSpy).toHaveBeenCalledWith('Speech Error', 'network');
  });
});
