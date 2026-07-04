/**
 * recitationTranscriber tests (spec 017 Phase 1). whisper.rn and the asset
 * pipeline are mocked — these pin the service contract: non-throwing
 * idempotent init, the iOS-release cache-copy fallback (spec 014 lesson),
 * throwing transcribe when not ready, and release/reset.
 */

const mockDownloadAsync = jest.fn(async () => {});
let mockLocalUri: string | null = 'file:///bundle/whisper-tiny-ar-quran.bin';

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: mockDownloadAsync,
      get localUri() {
        return mockLocalUri;
      },
    })),
  },
}));

const mockTranscribePromise = jest.fn(async () => ({ result: ' بسم الله ' }));
const mockRelease = jest.fn(async () => {});
const mockContext = {
  transcribe: jest.fn(() => ({ stop: jest.fn(), promise: mockTranscribePromise() })),
  release: mockRelease,
};
const mockInitWhisper = jest.fn(async (..._args: any[]) => mockContext);

jest.mock('whisper.rn', () => ({
  initWhisper: (...args: any[]) => mockInitWhisper(...args),
}));

const mockGetInfoAsync = jest.fn(async (..._args: any[]) => ({ exists: false }));
const mockCopyAsync = jest.fn(async (..._args: any[]) => {});
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///caches/',
  getInfoAsync: (...args: any[]) => mockGetInfoAsync(...args),
  copyAsync: (...args: any[]) => mockCopyAsync(...args),
}));

// The bundled GGML asset resolves through the jest asset transformer.
jest.mock('../../../assets/whisper-tiny-ar-quran.bin', () => 1, { virtual: true });

import {
  initRecitationTranscriber,
  isRecitationReady,
  transcribeRecitation,
  releaseRecitationTranscriber,
} from '../recitationTranscriber';

beforeEach(async () => {
  await releaseRecitationTranscriber(); // reset module state between tests
  jest.clearAllMocks();
  // Re-pin default implementations (clearAllMocks keeps one-off overrides
  // like mockRejectedValue from a previous test otherwise).
  mockInitWhisper.mockImplementation(async () => mockContext);
  mockGetInfoAsync.mockImplementation(async () => ({ exists: false }));
  mockTranscribePromise.mockImplementation(async () => ({ result: ' بسم الله ' }));
  mockLocalUri = 'file:///bundle/whisper-tiny-ar-quran.bin';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('init', () => {
  it('resolves true and becomes ready on the direct asset path', async () => {
    expect(isRecitationReady()).toBe(false);
    const ok = await initRecitationTranscriber();
    expect(ok).toBe(true);
    expect(isRecitationReady()).toBe(true);
    expect(mockInitWhisper).toHaveBeenCalledWith({
      filePath: 'file:///bundle/whisper-tiny-ar-quran.bin',
    });
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('is idempotent — concurrent and repeat calls share one native init', async () => {
    const [a, b] = await Promise.all([
      initRecitationTranscriber(),
      initRecitationTranscriber(),
    ]);
    const c = await initRecitationTranscriber();
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(true);
    expect(mockInitWhisper).toHaveBeenCalledTimes(1);
  });

  it('falls back to a Caches copy when the direct path fails (spec-014 lesson)', async () => {
    mockInitWhisper
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'ERR_MISSING_PERMISSION' }))
      .mockResolvedValueOnce(mockContext);

    const ok = await initRecitationTranscriber();
    expect(ok).toBe(true);
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: 'file:///bundle/whisper-tiny-ar-quran.bin',
      to: 'file:///caches/whisper-tiny-ar-quran.bin',
    });
    expect(mockInitWhisper).toHaveBeenLastCalledWith({
      filePath: 'file:///caches/whisper-tiny-ar-quran.bin',
    });
    expect(isRecitationReady()).toBe(true);
  });

  it('skips the copy when a cached model already exists', async () => {
    mockInitWhisper
      .mockRejectedValueOnce(new Error('fopen failed'))
      .mockResolvedValueOnce(mockContext);
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true });

    const ok = await initRecitationTranscriber();
    expect(ok).toBe(true);
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('resolves false (never throws) when both attempts fail', async () => {
    mockInitWhisper.mockRejectedValue(new Error('model corrupt'));
    const ok = await initRecitationTranscriber();
    expect(ok).toBe(false);
    expect(isRecitationReady()).toBe(false);
  });

  it('resolves false when the asset has no localUri', async () => {
    mockLocalUri = null;
    const ok = await initRecitationTranscriber();
    expect(ok).toBe(false);
    expect(isRecitationReady()).toBe(false);
    expect(mockInitWhisper).not.toHaveBeenCalled();
  });
});

describe('transcribeRecitation', () => {
  it('throws when the transcriber is not initialized', async () => {
    await expect(transcribeRecitation('file:///rec.wav')).rejects.toThrow(
      'not initialized'
    );
  });

  it('transcribes with language ar and returns the trimmed result', async () => {
    await initRecitationTranscriber();
    const transcript = await transcribeRecitation('file:///rec.wav');
    expect(mockContext.transcribe).toHaveBeenCalledWith('file:///rec.wav', {
      language: 'ar',
    });
    expect(transcript).toBe('بسم الله');
  });

  it('propagates transcription failures to the caller (fallback ladder)', async () => {
    await initRecitationTranscriber();
    mockTranscribePromise.mockRejectedValueOnce(new Error('decode failed'));
    await expect(transcribeRecitation('file:///rec.wav')).rejects.toThrow('decode failed');
  });
});

describe('release', () => {
  it('releases the native context and resets readiness; init can run again', async () => {
    await initRecitationTranscriber();
    expect(isRecitationReady()).toBe(true);

    await releaseRecitationTranscriber();
    expect(isRecitationReady()).toBe(false);
    expect(mockRelease).toHaveBeenCalledTimes(1);

    const ok = await initRecitationTranscriber();
    expect(ok).toBe(true);
    expect(isRecitationReady()).toBe(true);
  });
});
