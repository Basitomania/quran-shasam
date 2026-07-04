/**
 * On-device Whisper transcriber for Arabic recitation (spec 017 Phase 1).
 *
 * Wraps whisper.rn around the bundled recitation-fine-tuned GGML model
 * (deepdml/whisper-tiny-ar-quran-mix-norm, q5_1 — picked in the spec-017
 * Phase 0 eval). The voice path records the mic session to a 16 kHz PCM16
 * WAV (expo-speech-recognition `recordingOptions.persist`) and hands the
 * file here; whisper.cpp decodes PCM16 WAV natively.
 *
 * Non-throwing init, same background-init + degradation contract as the
 * ONNX services (semanticSearch / reranker): `initRecitationTranscriber`
 * returns false on any failure and the caller keeps the OS-recognizer
 * path. `transcribeRecitation` throws on runtime failure so the caller can
 * fall back within a single session.
 *
 * iOS-release bundle-asset lesson (spec 014): whisper.cpp reads the model
 * via native fopen, which CAN read the .app bundle path Asset.localUri
 * resolves to in release builds. But if init fails on the direct path
 * (path/permission errors), we copy the asset into Caches with the legacy
 * native copyAsync — exactly like semanticSearch.loadEmbeddings — and retry
 * once from the copy.
 */

import { Asset } from 'expo-asset';
import type { WhisperContext } from 'whisper.rn';

// Module state
let context: WhisperContext | null = null;
let isInitialized = false;
let initPromise: Promise<boolean> | null = null;

/**
 * Initialize the recitation transcriber. Non-throwing: resolves false on
 * any failure. Idempotent — concurrent/repeat calls share one init.
 */
export function initRecitationTranscriber(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<boolean> {
  try {
    console.log('[Recitation] === INIT START ===');

    console.log('[Recitation] Loading GGML model asset...');
    const modelAsset = Asset.fromModule(
      require('../../assets/whisper-tiny-ar-quran.bin')
    );
    await modelAsset.downloadAsync();
    if (!modelAsset.localUri) throw new Error('Failed to download Whisper GGML asset');
    console.log('[Recitation] Model localUri:', modelAsset.localUri);

    // whisper.rn resolves file:// URIs and raw paths alike (native fopen).
    // Lazy require: the native module only loads when init actually runs
    // (background, post-reranker), never on the import graph at startup.
    const { initWhisper } = require('whisper.rn') as typeof import('whisper.rn');

    const t0 = Date.now();
    try {
      context = await initWhisper({ filePath: modelAsset.localUri });
    } catch (initErr: any) {
      // iOS RELEASE builds embed assets inside the .app bundle; if the
      // direct path fails there, copy to Caches via the legacy native copy
      // (fast; NOT the forbidden readAsStringAsync+atob path) and retry.
      console.log(
        '[Recitation] Direct init failed, copying model to cache...',
        initErr?.code ?? String(initErr)
      );
      const legacyFs = require('expo-file-system/legacy');
      const cachedUri = `${legacyFs.cacheDirectory}whisper-tiny-ar-quran.bin`;
      const info = await legacyFs.getInfoAsync(cachedUri);
      if (!info.exists) {
        await legacyFs.copyAsync({ from: modelAsset.localUri, to: cachedUri });
      }
      context = await initWhisper({ filePath: cachedUri });
    }
    console.log('[Recitation] Whisper context created in', Date.now() - t0, 'ms');

    isInitialized = true;
    console.log('[Recitation] === INIT COMPLETE ===');
    return true;
  } catch (err: any) {
    console.error('[Recitation] === INIT FAILED ===');
    console.error('[Recitation] Error:', String(err));
    console.error('[Recitation] Error message:', err?.message);
    context = null;
    isInitialized = false;
    return false;
  }
}

export function isRecitationReady(): boolean {
  return isInitialized;
}

/**
 * Transcribe a recorded recitation WAV (16 kHz mono PCM16 — the format
 * expo-speech-recognition persists). Returns the trimmed Arabic transcript.
 *
 * Throws when the transcriber is not ready or transcription fails — the
 * caller falls back to the OS-recognizer transcript for that session.
 */
export async function transcribeRecitation(wavUri: string): Promise<string> {
  if (!isInitialized || !context) {
    throw new Error('Recitation transcriber not initialized');
  }

  const t0 = Date.now();
  const { promise } = context.transcribe(wavUri, { language: 'ar' });
  const { result } = await promise;
  const transcript = (result ?? '').trim();
  console.log(
    '[Recitation] Transcribed in',
    Date.now() - t0,
    'ms, chars:',
    transcript.length
  );
  return transcript;
}

/**
 * Release the native Whisper context. Init can be run again afterwards.
 */
export async function releaseRecitationTranscriber(): Promise<void> {
  const ctx = context;
  context = null;
  isInitialized = false;
  initPromise = null;
  if (ctx) {
    try {
      await ctx.release();
    } catch (err: any) {
      console.warn('[Recitation] Release failed:', err?.message ?? String(err));
    }
  }
}
