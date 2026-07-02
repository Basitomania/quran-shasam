/**
 * Test mock for expo-file-system (regression project only).
 *
 * Mirrors the v19+ JSI shape the app relies on: new File(uri).bytes()
 * returning a Uint8Array. Reads from the local filesystem, stripping the
 * file:// scheme the same way the app strips it before
 * InferenceSession.create.
 */
import * as fs from 'fs';

export class File {
  private readonly path: string;

  constructor(uri: string) {
    this.path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  }

  async bytes(): Promise<Uint8Array> {
    const buf = fs.readFileSync(this.path);
    // Return a Uint8Array over a standalone ArrayBuffer (not Buffer's pooled
    // one) so byte offsets behave like on device.
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
}
