# QuranShasam

Shazam for the Quran — hear a recitation, find the verse. A fully offline
mobile app for identifying and exploring Quran verses by voice, text, or theme.

## Features

- **Voice search** — recite or play a verse; on-device speech recognition and
  fuzzy matching identify it. The session auto-stops when you stop speaking.
- **AI thematic search** — ask in natural language ("Story of Balqis",
  "patience in hardship") and get relevant verses, powered by a two-stage
  on-device pipeline: a MiniLM bi-encoder over pre-computed verse embeddings
  for recall, then a cross-encoder reranker for precision. 100% offline,
  no API calls, no cost per query.
- **Text search** — Arabic and English with fuzzy matching.
- **Bookmarks** — save verses, swipe to delete, persists across restarts.
- **Copy & share** — long-press any verse card to copy; native share sheet.

## Principles

- Quran text and translations are never paywalled.
- No ads, no analytics, no tracking.
- Offline-first: all core functionality works without a network connection.

## Tech

- React Native + Expo (dev client), TypeScript
- `onnxruntime-react-native` for on-device inference
  - Bi-encoder: `all-MiniLM-L6-v2` (384-dim, int8) over 6,236 pre-computed
    verse embeddings
  - Reranker: `ms-marco-MiniLM-L-6-v2` cross-encoder (int8) over a hybrid
    candidate pool (semantic top-50 + lexical topic-tag matches)
- Verse index enriched offline with entity aliases and story context drawn
  from classical tafsir, so queries like "Balqis" find verses whose
  translation never uses that name
- `expo-speech-recognition` for voice input

## Getting started

```bash
npm install
npx expo run:ios      # or: npx expo run:android
```

Requires a development build (not Expo Go) because of the native ONNX
runtime module.

## License

Quran text and translations are from the [alquran.cloud](https://alquran.cloud)
API (Sahih International). The app never modifies the sacred text.
