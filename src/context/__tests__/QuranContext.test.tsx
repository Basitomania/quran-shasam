/**
 * QuranContext tests. All service modules are mocked so these pin the
 * context's orchestration only — most importantly the CLAUDE.md
 * non-negotiable: semantic search init loads in the BACKGROUND and is never
 * awaited on the startup critical path. The startup-order test below gives
 * initSemanticSearch a never-resolving promise; if anyone adds an `await`
 * before `setIsLoading(false)`, the test times out and fails loudly.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

jest.mock('../../services/quranDataLoader', () => ({
  loadQuranData: jest.fn(),
}));
jest.mock('../../services/verseMatcher', () => ({
  VerseMatcher: jest.fn().mockImplementation(() => ({
    findTopMatches: jest.fn(() => []),
  })),
}));
jest.mock('../../services/localThematicSearch', () => ({
  loadSearchIndex: jest.fn(),
}));
jest.mock('../../services/semanticSearch', () => ({
  initSemanticSearch: jest.fn(),
  setVerseMeta: jest.fn(),
}));
jest.mock('../../services/reranker', () => ({
  initReranker: jest.fn(),
}));
// The real JSON assets are megabytes; the context only threads them through
// to the (mocked) services, so empty stand-ins keep this suite fast.
jest.mock('../../../assets/keyword_index.json', () => ({}));
jest.mock('../../../assets/verse_index.json', () => []);
jest.mock('../../../assets/tokenizer.json', () => ({ model: { vocab: {} } }));
jest.mock('../../../assets/reranker_tokenizer.json', () => ({}));

import { QuranProvider, useQuranData } from '../QuranContext';
import { loadQuranData } from '../../services/quranDataLoader';
import { loadSearchIndex } from '../../services/localThematicSearch';
import { initSemanticSearch, setVerseMeta } from '../../services/semanticSearch';
import { initReranker } from '../../services/reranker';
import { FIXTURE_VERSES } from '../../../test/fixtures/verses.small';

const mockLoadQuranData = jest.mocked(loadQuranData);
const mockLoadSearchIndex = jest.mocked(loadSearchIndex);
const mockInitSemanticSearch = jest.mocked(initSemanticSearch);
const mockSetVerseMeta = jest.mocked(setVerseMeta);
const mockInitReranker = jest.mocked(initReranker);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const NEVER = new Promise<boolean>(() => {});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QuranProvider>{children}</QuranProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  // Quiet the context's progress logging; individual tests re-spy console.error.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockLoadQuranData.mockResolvedValue(FIXTURE_VERSES);
  mockLoadSearchIndex.mockResolvedValue(undefined);
  mockInitSemanticSearch.mockReturnValue(NEVER);
  mockInitReranker.mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('startup order (never await semantic init on the critical path)', () => {
  it('reaches searchReady / isLoading=false while initSemanticSearch never resolves', async () => {
    const { result } = renderHook(() => useQuranData(), { wrapper });

    // If someone awaits initSemanticSearch before setIsLoading(false), this
    // waitFor times out — the pinned failure mode.
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.searchReady).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.verses).toEqual(FIXTURE_VERSES);
    expect(result.current.matcher).not.toBeNull();
    // Semantic init was started in the background but is still pending.
    expect(mockSetVerseMeta).toHaveBeenCalledTimes(1);
    expect(mockInitSemanticSearch).toHaveBeenCalledTimes(1);
    expect(result.current.semanticReady).toBe(false);
  });
});

describe('background semantic init', () => {
  it('flips semanticReady when init resolves true later, then chains the reranker', async () => {
    const semantic = deferred<boolean>();
    mockInitSemanticSearch.mockReturnValue(semantic.promise);

    const { result } = renderHook(() => useQuranData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.semanticReady).toBe(false);

    await act(async () => {
      semantic.resolve(true);
    });

    await waitFor(() => expect(result.current.semanticReady).toBe(true));
    expect(mockInitReranker).toHaveBeenCalledTimes(1);
  });

  it('init resolving false leaves the app usable, no error, no reranker', async () => {
    const semantic = deferred<boolean>();
    mockInitSemanticSearch.mockReturnValue(semantic.promise);

    const { result } = renderHook(() => useQuranData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      semantic.resolve(false);
    });

    expect(result.current.semanticReady).toBe(false);
    expect(result.current.searchReady).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockInitReranker).not.toHaveBeenCalled();
  });

  it('init rejecting leaves the app usable and surfaces no error', async () => {
    // The context logs the rejection via console.error — expected noise here.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const semantic = deferred<boolean>();
    mockInitSemanticSearch.mockReturnValue(semantic.promise);

    const { result } = renderHook(() => useQuranData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      semantic.reject(new Error('onnx session failed'));
    });

    expect(result.current.semanticReady).toBe(false);
    expect(result.current.searchReady).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('load failure and retry', () => {
  it('sets error when loadQuranData rejects; retry() re-runs and can succeed', async () => {
    mockLoadQuranData
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(FIXTURE_VERSES);

    const { result } = renderHook(() => useQuranData(), { wrapper });

    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.searchReady).toBe(false);

    act(() => {
      result.current.retry();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.searchReady).toBe(true);
    expect(result.current.verses).toEqual(FIXTURE_VERSES);
    expect(mockLoadQuranData).toHaveBeenCalledTimes(2);
  });
});

describe('cancellation flag', () => {
  it('unmounting mid-init does not warn (no setState after unmount)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const load = deferred<typeof FIXTURE_VERSES>();
    mockLoadQuranData.mockReturnValue(load.promise);

    const { unmount } = renderHook(() => useQuranData(), { wrapper });
    unmount();

    await act(async () => {
      load.resolve(FIXTURE_VERSES);
      await load.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('unmounting while semantic init is pending does not warn when it later resolves', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const semantic = deferred<boolean>();
    mockInitSemanticSearch.mockReturnValue(semantic.promise);

    const { result, unmount } = renderHook(() => useQuranData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();

    await act(async () => {
      semantic.resolve(true);
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
