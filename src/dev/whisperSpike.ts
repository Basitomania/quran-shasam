/**
 * Dev-only on-device Whisper latency spike (spec 017, Phase 0 item 3).
 *
 * Loads a GGML Whisper model + a 16 kHz mono wav fixture that have been
 * SIDELOADED into <documentDirectory>/whisper/ (nothing is bundled into app
 * assets — the model is a 32-60 MB dev-only artifact):
 *
 *   iOS simulator:
 *     APP=$(xcrun simctl get_app_container booted com.quranshasam.app data)
 *     mkdir -p "$APP/Documents/whisper"
 *     cp model-pipeline/whisper_ggml/ggml-tiny-ar-quran-q5_1.bin \
 *        model-pipeline/eval_audio/Alafasy_001001.wav "$APP/Documents/whisper/"
 *
 *   Android (debuggable dev build):
 *     adb push <file> /data/local/tmp/
 *     adb shell run-as com.quranshasam.app mkdir -p files/whisper
 *     adb shell run-as com.quranshasam.app cp /data/local/tmp/<file> files/whisper/
 *
 * Picks the first *.bin and first *.wav found in that directory, times
 * initWhisper and transcribe (language 'ar'), and logs a machine-greppable
 * line:
 *   [WhisperSpike] model=<name> init=<ms> transcribe=<ms> audio=<s> rtf=<x> transcript=<...>
 *
 * Never imported in production code paths — only lazy-imported behind __DEV__.
 */

import { Directory, File, Paths } from 'expo-file-system';

export interface WhisperSpikeResult {
  modelName: string;
  wavName: string;
  initMs: number;
  transcribeMs: number;
  audioSec: number;
  /** transcribe time / audio duration — <1 means faster than realtime. */
  rtf: number;
  transcript: string;
}

/** Duration of a 16 kHz 16-bit mono PCM wav from its byte size (44-byte header). */
const wavDurationSec = (bytes: number): number => (bytes - 44) / (16000 * 2);

// Physical devices have no simctl/adb sideload path. When the sideload dir
// is empty, the spike downloads the fixtures from the dev Mac over LAN —
// run this on the Mac first (serves model-pipeline on port 8987):
//   cd model-pipeline && /usr/local/bin/python3.11 -m http.server 8987
// The dev-client debug build allows cleartext HTTP, and the host below is
// the same LAN address Metro uses.
const SIDELOAD_HTTP_BASE = 'http://192.168.1.152:8987';
const SIDELOAD_FILES = [
  'whisper_ggml/ggml-tiny-ar-quran-q5_1.bin',
  'eval_audio/Alafasy_001001.wav',
];

async function downloadFixtures(dir: Directory, onProgress?: (msg: string) => void): Promise<void> {
  if (!dir.exists) dir.create({ intermediates: true });
  for (const rel of SIDELOAD_FILES) {
    const name = rel.split('/').pop() as string;
    onProgress?.(`Downloading ${name}…`);
    await File.downloadFileAsync(`${SIDELOAD_HTTP_BASE}/${rel}`, new File(dir, name));
  }
}

export async function runWhisperSpike(
  onProgress?: (msg: string) => void
): Promise<WhisperSpikeResult> {
  const dir = new Directory(Paths.document, 'whisper');

  let entries = dir.exists ? dir.list() : [];
  let model = entries.find((e): e is File => e instanceof File && e.name.endsWith('.bin'));
  let wav = entries.find((e): e is File => e instanceof File && e.name.endsWith('.wav'));

  if (!model || !wav) {
    // Nothing sideloaded — fetch from the dev Mac (physical-device path).
    try {
      await downloadFixtures(dir, onProgress);
    } catch (err: any) {
      throw new Error(
        `No fixtures in ${dir.uri} and download from ${SIDELOAD_HTTP_BASE} failed ` +
          `(${err?.message ?? err}).\n` +
          'Either sideload manually (see whisperSpike.ts header) or start the ' +
          'server on the Mac: cd model-pipeline && python3 -m http.server 8987'
      );
    }
    entries = dir.list();
    model = entries.find((e): e is File => e instanceof File && e.name.endsWith('.bin'));
    wav = entries.find((e): e is File => e instanceof File && e.name.endsWith('.wav'));
  }

  if (!model || !wav) {
    throw new Error(
      `Need one *.bin and one *.wav in ${dir.uri} — found: ` +
        (entries.map((e) => e.name).join(', ') || '(empty)')
    );
  }

  // Lazy-load the native binding so whisper.rn never touches production paths.
  // NOTE: whisper.rn 0.6.0 ships a broken `exports` map (extensionless
  // targets, react-native condition missing the ./ prefix), so TS bundler
  // resolution can't see it — a tsconfig `paths` entry maps the bare
  // specifier to lib/typescript/index.d.ts. Metro resolves it via the legacy
  // main/react-native fields at runtime.
  const { initWhisper } = await import('whisper.rn');

  const t0 = Date.now();
  const ctx = await initWhisper({ filePath: model.uri });
  const initMs = Date.now() - t0;

  const audioSec = wavDurationSec(wav.size ?? 44);

  const t1 = Date.now();
  const { promise } = ctx.transcribe(wav.uri, { language: 'ar' });
  const { result } = await promise;
  const transcribeMs = Date.now() - t1;

  await ctx.release();

  const transcript = (result ?? '').trim();
  const rtf = audioSec > 0 ? transcribeMs / 1000 / audioSec : NaN;

  console.log(
    `[WhisperSpike] model=${model.name} init=${initMs} transcribe=${transcribeMs} ` +
      `audio=${audioSec.toFixed(2)} rtf=${rtf.toFixed(2)} transcript=${transcript}`
  );

  return {
    modelName: model.name,
    wavName: wav.name,
    initMs,
    transcribeMs,
    audioSec,
    rtf,
    transcript,
  };
}
