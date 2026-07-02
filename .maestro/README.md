# Maestro e2e flows

Black-box flows against the installed app. IDs come from `src/testIDs.ts` —
keep them in sync.

## Prerequisites

- Maestro CLI: `curl -Ls https://get.maestro.mobile.dev | bash`
- A build of the app installed on the target device/emulator. Use a
  **release-style build** (bundled JS) so flows don't depend on Metro:
  - Android: `eas build -p android --profile preview` and install the APK,
    or `npx expo run:android --variant release`
  - iOS simulator: `npx expo run:ios --configuration Release`
  - A debug/dev-client build also works locally if Metro is running and the
    app was opened once so the bundle is loaded.

## Run

```bash
maestro test .maestro/                 # all flows
maestro test .maestro/text-search.yaml # one flow
```

## Notes

- `voice-shallow.yaml` only asserts the Voice screen renders and the language
  toggle works. Actual speech recognition is NOT e2e-testable (no mic audio
  injection); spec-011 behavior is pinned by unit tests in
  `src/screens/__tests__/VoiceSearchScreen.test.tsx`.
- Semantic search initializes in the background after launch; flows that rely
  on AI results use generous `extendedWaitUntil` timeouts.
- `bookmarks-roundtrip.yaml` clears app state at start (`clearState`), so run
  it on test devices only.
