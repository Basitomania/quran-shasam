/**
 * Spec 018 — voice session UX phase transitions.
 *
 * Covers the sessionPhase layer ONLY (progress label, status feedback,
 * try-again). Session SEMANTICS (silence auto-stop, 15s cap, process-once,
 * language-toggle-stops) are the spec-011 contract, pinned UNMODIFIED in
 * VoiceSearchScreen.test.tsx — this file must not duplicate-or-drift them.
 *
 * Mock scaffolding mirrors the pin suite: expo-speech-recognition handlers
 * captured into a map, Whisper transcriber + match ladder injectable.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

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

// Handle to the mocked native stop() for the manual-stop-gate assertions.
const mockStop: jest.Mock =
  jest.requireMock('expo-speech-recognition').ExpoSpeechRecognitionModule.stop;

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

const mockFindTopMatches = jest.fn((): any[] => []);
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

jest.mock('../../components/VerseCard', () => ({
  VerseCard: () => null,
}));

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { VoiceSearchScreen } from '../VoiceSearchScreen';
import { testIDs } from '../../testIDs';

const startMock = ExpoSpeechRecognitionModule.start as jest.Mock;
const stopMock = ExpoSpeechRecognitionModule.stop as jest.Mock;

const SOME_MATCH = [{ verse: { surah: 112, ayah: 1 }, score: 80 }];

function fireSpeechEvent(name: string, event?: any) {
  act(() => {
    mockHandlers[name]?.(event);
  });
}

async function pressMic(getByTestId: (id: string) => any) {
  await act(async () => {
    fireEvent.press(getByTestId(testIDs.voice.micButton));
  });
}

function statusText(getByTestId: (id: string) => any): string {
  return getByTestId(testIDs.voice.status).props.children;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsRecitationReady.mockImplementation(() => false);
  mockTranscribeRecitation.mockImplementation(async () => 'بسم الله');
  mockMatchVoiceTranscript.mockImplementation(async () => []);
  mockFindTopMatches.mockImplementation(() => []);
  (ExpoSpeechRecognitionModule.supportsRecording as jest.Mock).mockImplementation(() => true);
  (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockImplementation(() =>
    Promise.resolve({ granted: true })
  );
  for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
});

afterEach(() => {
  jest.useRealTimers();
});

describe('progress label (visible 15s window)', () => {
  it('is hidden when idle, shows 0:00 / 0:15 on session start', () => {
    const { getByTestId, queryByTestId } = render(<VoiceSearchScreen />);
    expect(queryByTestId(testIDs.voice.progress)).toBeNull();

    fireSpeechEvent('start');

    expect(getByTestId(testIDs.voice.progress).props.children).toBe('0:00 / 0:15');
  });

  it('ticks once per second and clamps at the 15s budget', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    expect(getByTestId(testIDs.voice.progress).props.children).toBe('0:07 / 0:15');

    // Past the cap the label must not overrun the budget (the cap timer has
    // already force-stopped the recognizer; `end` arrives from the OS).
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(getByTestId(testIDs.voice.progress).props.children).toBe('0:15 / 0:15');
  });

  it('disappears when the session ends and the tick stops', () => {
    jest.useFakeTimers();
    const { queryByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    fireSpeechEvent('end');

    expect(queryByTestId(testIDs.voice.progress)).toBeNull();
    // No lingering interval: advancing time must not re-render/throw.
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(queryByTestId(testIDs.voice.progress)).toBeNull();
  });
});

describe('status line per phase', () => {
  it('idle -> listening -> results on the OS-recognizer path', () => {
    mockFindTopMatches.mockImplementation(() => SOME_MATCH);
    const { getByTestId, queryByTestId } = render(<VoiceSearchScreen />);
    expect(statusText(getByTestId)).toBe('Tap to start listening');

    fireSpeechEvent('start');
    // Spec 018 amendment: the first MIN_STOP_MS show a keep-going countdown.
    expect(statusText(getByTestId)).toBe('Listening... keep going (5s)');

    fireSpeechEvent('result', { results: [{ transcript: 'qul huwa allah' }], isFinal: false });
    fireSpeechEvent('end');

    // OS path transcription/matching is synchronous — lands on results with
    // no dead-air phase left on screen.
    expect(statusText(getByTestId)).toBe('Tap to start listening');
    expect(queryByTestId(testIDs.voice.tryAgain)).toBeNull();
  });

  it('walks listening -> transcribing -> matching -> results on the Whisper path', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    let resolveTranscribe!: (t: string) => void;
    mockTranscribeRecitation.mockImplementation(
      () => new Promise<string>((res) => (resolveTranscribe = res))
    );
    let resolveMatch!: (m: any[]) => void;
    mockMatchVoiceTranscript.mockImplementation(
      () => new Promise<any[]>((res) => (resolveMatch = res))
    );
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    expect(statusText(getByTestId)).toBe('Listening... keep going (5s)');

    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    expect(statusText(getByTestId)).toBe('Recognizing recitation...');

    await act(async () => {
      resolveTranscribe('قل هو الله احد');
    });
    expect(statusText(getByTestId)).toBe('Finding the verse...');

    await act(async () => {
      resolveMatch(SOME_MATCH);
    });
    expect(statusText(getByTestId)).toBe('Tap to start listening');
  });
});

describe('tap-to-stop mid-session', () => {
  it('stops immediately at 5s and proceeds to results after end', async () => {
    jest.useFakeTimers();
    mockFindTopMatches.mockImplementation(() => SOME_MATCH);
    const { getByTestId, queryByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await pressMic(getByTestId);
    expect(stopMock).toHaveBeenCalledTimes(1);

    fireSpeechEvent('result', { results: [{ transcript: 'bismillah' }], isFinal: false });
    fireSpeechEvent('end');

    expect(mockFindTopMatches).toHaveBeenCalledTimes(1);
    expect(statusText(getByTestId)).toBe('Tap to start listening');
    expect(queryByTestId(testIDs.voice.progress)).toBeNull();
  });

  it('ignores mic taps while a previous session is still transcribing', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    let resolveTranscribe!: (t: string) => void;
    mockTranscribeRecitation.mockImplementation(
      () => new Promise<string>((res) => (resolveTranscribe = res))
    );
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    expect(statusText(getByTestId)).toBe('Recognizing recitation...');

    await pressMic(getByTestId);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveTranscribe('');
    });
  });
});

describe('15s cap and empty sessions', () => {
  it('returns to idle when the session ends with nothing to process', () => {
    jest.useFakeTimers();
    const { getByTestId, queryByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    // Cap force-stopped the recognizer (pinned in the spec-011 suite); the
    // OS then delivers `end` with no transcript captured.
    fireSpeechEvent('end');

    expect(statusText(getByTestId)).toBe('Tap to start listening');
    expect(queryByTestId(testIDs.voice.progress)).toBeNull();
  });

  it('returns to idle after a generic recognizer error', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    fireSpeechEvent('error', { error: 'audio-capture' });

    expect(statusText(getByTestId)).toBe('Tap to start listening');
  });

  it('silence gate: no-speech routes to no-match and never reaches Whisper', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    fireSpeechEvent('error', { error: 'no-speech' });
    // A silent session still records a WAV — the gate must keep it away
    // from the transcriber (recitation-tuned Whisper hallucinates verse
    // text on silence).
    fireSpeechEvent('audioend', { uri: 'file:///cache/silent.wav' });
    fireSpeechEvent('end');

    expect(mockTranscribeRecitation).not.toHaveBeenCalled();
    expect(statusText(getByTestId)).toBe('No matching verse found');
    expect(getByTestId(testIDs.voice.tryAgain)).toBeTruthy();
  });

  it('manual-stop gate: a stop tap before 5s is ignored, after 5s it stops', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId); // start session
    fireSpeechEvent('start');
    mockStop.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    fireEvent.press(getByTestId(testIDs.voice.micButton));
    expect(mockStop).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(3500);
    });
    fireEvent.press(getByTestId(testIDs.voice.micButton));
    expect(mockStop).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('no-match and try again', () => {
  it('shows the friendly no-match state when the matcher finds nothing', () => {
    const { getByTestId } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'gibberish' }], isFinal: false });
    fireSpeechEvent('end');

    expect(statusText(getByTestId)).toBe('No matching verse found');
    expect(getByTestId(testIDs.voice.tryAgain)).toBeTruthy();
  });

  it('try again resets to idle and clears the heard transcript', () => {
    const { getByTestId, queryByTestId, queryByText } = render(<VoiceSearchScreen />);

    fireSpeechEvent('start');
    fireSpeechEvent('result', { results: [{ transcript: 'gibberish' }], isFinal: false });
    fireSpeechEvent('end');
    fireEvent.press(getByTestId(testIDs.voice.tryAgain));

    expect(statusText(getByTestId)).toBe('Tap to start listening');
    expect(queryByTestId(testIDs.voice.tryAgain)).toBeNull();
    expect(queryByText(/Heard:/)).toBeNull();
  });

  it('whisper path with an empty ladder result lands on no-match', async () => {
    mockIsRecitationReady.mockImplementation(() => true);
    const { getByTestId } = render(<VoiceSearchScreen />);

    await pressMic(getByTestId);
    fireSpeechEvent('start');
    fireSpeechEvent('audioend', { uri: 'file:///cache/recording.wav' });
    fireSpeechEvent('end');
    await act(async () => {});

    expect(statusText(getByTestId)).toBe('No matching verse found');
    expect(getByTestId(testIDs.voice.tryAgain)).toBeTruthy();
  });
});
