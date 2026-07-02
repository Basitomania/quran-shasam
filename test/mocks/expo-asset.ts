/**
 * Test mock for expo-asset (regression project only).
 *
 * The asset transformer turns require('../../assets/x.onnx') into the file's
 * absolute path; Asset.fromModule receives that path and exposes it the way
 * the real module does after downloadAsync: a file:// localUri.
 */
export class Asset {
  localUri: string | null;

  private constructor(path: string) {
    this.localUri = `file://${path}`;
  }

  static fromModule(mod: unknown): Asset {
    if (typeof mod !== 'string') {
      throw new Error(
        `expo-asset mock expected a file path from the asset transformer, got ${typeof mod}`
      );
    }
    return new Asset(mod);
  }

  async downloadAsync(): Promise<void> {
    // Assets are already on disk in tests.
  }
}
