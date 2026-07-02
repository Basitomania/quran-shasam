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
  },
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
