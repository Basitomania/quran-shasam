/**
 * On-device semantic search using ONNX Runtime + pre-computed embeddings.
 * Gives Claude-quality results with zero API costs.
 *
 * How it works:
 * 1. Pre-computed 384D embeddings for all 6,236 verses (loaded from embeddings.bin)
 * 2. User query → tokenized → ONNX model → 384D query embedding
 * 3. Cosine similarity between query embedding and all verse embeddings
 * 4. Return top N most similar verses
 */

import { File as ExpoFile } from 'expo-file-system';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { QuranVerse, ThematicResult } from '../types/quran';
import { Asset } from 'expo-asset';
import { isRerankerReady, rerank } from './reranker';

// Once-per-session flag so we log rerank failures once, don't spam retries.
let rerankErroredThisSession = false;

export interface TokenizerData {
  model: {
    vocab: { [token: string]: number };
  };
}

// Module state
let session: InferenceSession | null = null;
let tokenizer: TokenizerData | null = null;
let verseEmbeddings: Float32Array[] | null = null;
let verseMeta: { surah: number; ayah: number }[] | null = null;
let verseTopics: Map<string, string> | null = null;
let dimensions = 384;
let isInitialized = false;

/**
 * Initialize the semantic search engine.
 * Loads the ONNX model, tokenizer, and pre-computed embeddings.
 */
export async function initSemanticSearch(
  tokenizerData: any,
  onProgress?: (msg: string) => void
): Promise<boolean> {
  try {
    console.log('[Semantic] === INIT START ===');

    console.log('[Semantic] Step 1: Loading tokenizer...');
    onProgress?.('Loading tokenizer...');
    tokenizer = tokenizerData as TokenizerData;
    const vocabSize = tokenizer?.model?.vocab ? Object.keys(tokenizer.model.vocab).length : 0;
    console.log('[Semantic] Tokenizer loaded, vocab size:', vocabSize);

    console.log('[Semantic] Step 2: Loading ONNX model asset...');
    onProgress?.('Loading ONNX model...');
    const modelAsset = Asset.fromModule(require('../../assets/model.onnx'));
    console.log('[Semantic] Model asset created, downloading...');
    await modelAsset.downloadAsync();
    console.log('[Semantic] Model downloaded, localUri:', modelAsset.localUri);
    if (!modelAsset.localUri) throw new Error('Failed to download ONNX model');

    console.log('[Semantic] Step 3: Creating InferenceSession...');
    const t0 = Date.now();
    // onnxruntime needs a raw file path, not a file:// URI
    const modelPath = modelAsset.localUri.replace('file://', '');
    console.log('[Semantic] Model path (stripped):', modelPath);
    try {
      session = await InferenceSession.create(modelPath);
    } catch (onnxErr) {
      console.error('[Semantic] InferenceSession.create error:', String(onnxErr));
      console.error('[Semantic] InferenceSession.create error JSON:', JSON.stringify(onnxErr));
      throw onnxErr;
    }
    console.log('[Semantic] InferenceSession created in', Date.now() - t0, 'ms');

    console.log('[Semantic] Step 4: Loading verse embeddings...');
    onProgress?.('Loading verse embeddings...');
    const t1 = Date.now();
    await loadEmbeddings();
    console.log('[Semantic] Embeddings loaded in', Date.now() - t1, 'ms');
    console.log('[Semantic] Verse embeddings count:', verseEmbeddings?.length, 'dimensions:', dimensions);

    isInitialized = true;
    console.log('[Semantic] === INIT COMPLETE - SUCCESS ===');
    onProgress?.('Semantic search ready!');
    return true;
  } catch (err: any) {
    console.error('[Semantic] === INIT FAILED ===');
    console.error('[Semantic] Error type:', typeof err);
    console.error('[Semantic] Error string:', String(err));
    console.error('[Semantic] Error JSON:', JSON.stringify(err));
    console.error('[Semantic] Error name:', err?.name);
    console.error('[Semantic] Error message:', err?.message);
    console.error('[Semantic] Error stack:', err?.stack);
    return false;
  }
}

async function loadEmbeddings(): Promise<void> {
  console.log('[Semantic] loadEmbeddings: Creating asset...');
  const embAsset = Asset.fromModule(require('../../assets/embeddings.bin'));

  console.log('[Semantic] loadEmbeddings: Downloading asset...');
  await embAsset.downloadAsync();
  console.log('[Semantic] loadEmbeddings: localUri:', embAsset.localUri);
  if (!embAsset.localUri) throw new Error('Failed to download embeddings');

  console.log('[Semantic] loadEmbeddings: Reading bytes via ExpoFile...');
  const uri = embAsset.localUri.startsWith('file://') ? embAsset.localUri : `file://${embAsset.localUri}`;
  console.log('[Semantic] loadEmbeddings: File URI:', uri);

  console.log('[Semantic] loadEmbeddings: calling bytes()...');
  const t0 = Date.now();
  let bytes: Uint8Array;
  try {
    bytes = await new ExpoFile(uri).bytes();
  } catch (err: any) {
    // iOS RELEASE builds embed assets inside the .app bundle, and
    // expo-file-system v19 denies reads there (ERR_MISSING_PERMISSION).
    // Debug builds never hit this (assets land in Caches). Copy the asset
    // into Caches with the legacy native copy (fast; NOT the forbidden
    // readAsStringAsync+atob path) and read the copy.
    console.log('[Semantic] loadEmbeddings: direct bytes() failed, copying to cache...', err?.code ?? String(err));
    const legacyFs = require('expo-file-system/legacy');
    const cachedUri = `${legacyFs.cacheDirectory}embeddings.bin`;
    const info = await legacyFs.getInfoAsync(cachedUri);
    if (!info.exists) {
      await legacyFs.copyAsync({ from: uri, to: cachedUri });
    }
    bytes = await new ExpoFile(cachedUri).bytes();
  }
  console.log('[Semantic] loadEmbeddings: bytes() returned in', Date.now() - t0, 'ms, size:', bytes.length);

  const buffer = bytes.buffer;

  // Parse header: count (uint32) + dimensions (uint32)
  const header = new Uint32Array(buffer, 0, 2);
  const count = header[0];
  dimensions = header[1];
  console.log('[Semantic] loadEmbeddings: Header - count:', count, 'dimensions:', dimensions);

  if (count === 0 || dimensions === 0 || count > 100000 || dimensions > 1000) {
    throw new Error(`Invalid header: count=${count}, dimensions=${dimensions}. File may be corrupt or wrong format.`);
  }

  // Parse embeddings
  const allData = new Float32Array(buffer, 8);
  console.log('[Semantic] loadEmbeddings: Float32Array length:', allData.length, 'expected:', count * dimensions);

  verseEmbeddings = [];
  for (let i = 0; i < count; i++) {
    const offset = i * dimensions;
    verseEmbeddings.push(allData.slice(offset, offset + dimensions));
  }
  console.log('[Semantic] loadEmbeddings: Parsed', verseEmbeddings.length, 'verse embeddings');
}

/**
 * Set verse metadata (surah:ayah mapping) from the verse index.
 * Also captures the per-verse topic tags (`t`) — the reranker needs them:
 * entity names like "Balqis" exist only in the tags, never in the
 * translation, and a translation-only rerank actively demotes the verses
 * the enriched retrieval correctly surfaced (measured 4/10 vs 10/10 on the
 * spec-012 sanity set).
 */
export function setVerseMeta(verseIndex: { s: number; a: number; t?: string }[]): void {
  verseMeta = verseIndex.map((v) => ({ surah: v.s, ayah: v.a }));
  verseTopics = new Map(verseIndex.map((v) => [`${v.s}:${v.a}`, v.t ?? '']));
}

/**
 * Bi-encoder retrieval — the first stage. Runs the query through the
 * MiniLM ONNX model, mean-pools + L2-normalizes to a 384D query vector,
 * cosine-scores against all verse embeddings, sorts, caps at `k`.
 *
 * This does NOT apply a minScore filter — callers do that (retrieval-only
 * path uses cosine 0.35, rerank path uses sigmoid 0.5 in a different space).
 */
export async function retrieveCandidates(
  query: string,
  verses: QuranVerse[],
  k: number = 50
): Promise<{ verse: QuranVerse; retrievalScore: number; topics: string }[]> {
  if (!isInitialized || !session || !tokenizer || !verseEmbeddings || !verseMeta) {
    throw new Error('Semantic search not initialized');
  }

  // 1. Tokenize the query
  const inputIds = tokenize(query, tokenizer);
  const attentionMask = inputIds.map((id) => (id !== 0 ? 1 : 0));

  // 2. Run ONNX inference
  const inputIdsTensor = new Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]);
  const attentionMaskTensor = new Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, attentionMask.length]);

  const results = await session.run({
    input_ids: inputIdsTensor,
    attention_mask: attentionMaskTensor,
  });

  // 3. Mean pooling over the output (ignoring padding tokens)
  const lastHiddenState = results.last_hidden_state;
  const outputData = lastHiddenState.data as Float32Array;
  const seqLen = inputIds.length;

  const queryEmbedding = new Float32Array(dimensions);
  let tokenCount = 0;

  for (let t = 0; t < seqLen; t++) {
    if (attentionMask[t] === 1) {
      for (let d = 0; d < dimensions; d++) {
        queryEmbedding[d] += outputData[t * dimensions + d];
      }
      tokenCount++;
    }
  }

  // Average and normalize
  if (tokenCount > 0) {
    let norm = 0;
    for (let d = 0; d < dimensions; d++) {
      queryEmbedding[d] /= tokenCount;
      norm += queryEmbedding[d] * queryEmbedding[d];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let d = 0; d < dimensions; d++) {
        queryEmbedding[d] /= norm;
      }
    }
  }

  // 4. Compute cosine similarity with all verse embeddings
  const scores: { index: number; score: number }[] = [];
  for (let i = 0; i < verseEmbeddings.length; i++) {
    let dotProduct = 0;
    for (let d = 0; d < dimensions; d++) {
      dotProduct += queryEmbedding[d] * verseEmbeddings[i][d];
    }
    scores.push({ index: i, score: dotProduct });
  }

  // 5. Sort, cap at k. No minScore filter here — that's the caller's job.
  scores.sort((a, b) => b.score - a.score);
  const topK = scores.slice(0, k);

  // Build verse lookup
  const verseLookup = new Map<string, QuranVerse>();
  for (const v of verses) {
    verseLookup.set(`${v.surah}:${v.ayah}`, v);
  }

  const out: { verse: QuranVerse; retrievalScore: number; topics: string }[] = [];
  for (const r of topK) {
    const meta = verseMeta![r.index];
    if (!meta) continue;
    const key = `${meta.surah}:${meta.ayah}`;
    const verse = verseLookup.get(key);
    if (!verse) continue;
    out.push({ verse, retrievalScore: r.score, topics: verseTopics?.get(key) ?? '' });
  }
  return out;
}

/**
 * Perform semantic search.
 *
 * Two-stage pipeline when the reranker is loaded:
 *   1. Hybrid candidate pool: top-50 by cosine + up to 25 lexical
 *      topic-tag matches (catches entity queries whose embedding rank
 *      is poor, at negligible cost).
 *   2. Cross-encoder rerank: joint (query, verse+tags) scoring by raw
 *      logit; display % is normalized within the result set.
 *
 * When the reranker isn't ready (still initializing, or init failed, or
 * a runtime failure occurred earlier this session), returns the
 * retrieval-only path with cosine minScore = 0.35 — unchanged behavior.
 */
export async function semanticSearch(
  query: string,
  verses: QuranVerse[],
  topN: number = 10
): Promise<ThematicResult[]> {
  const candidates = await retrieveCandidates(query, verses, 50);

  const useRerank = isRerankerReady() && !rerankErroredThisSession;

  if (useRerank) {
    try {
      // Hybrid pool: top-50 by cosine + up to 25 lexical tag matches.
      // The lexical scan replaces the earlier k=500 deep pool at ~1/8 the
      // rerank cost: it exists to catch verses whose topic tags literally
      // contain the query terms but whose embedding ranks poorly (e.g.
      // 17:1 sits at cosine rank ~#96 for "Night journey" even though its
      // tags say "Isra, Night Journey, Miraj").
      const pool = [...candidates, ...lexicalCandidates(query, verses, 25, candidates)];
      const reranked = await rerank(query, pool, topN);
      // MS-MARCO cross-encoders emit deeply negative logits (sigmoid ≈ 0)
      // for typical passages, so an absolute sigmoid gate would drop every
      // result. Normalize the % display against the top score in this
      // result set so the ordering is visible without a false-confidence
      // absolute number.
      if (reranked.length === 0) return [];
      const topScore = reranked[0].score;
      const minScore = reranked[reranked.length - 1].score;
      const range = topScore - minScore || 1;
      return reranked.map((r) => {
        const relative = (r.score - minScore) / range;
        return {
          verse: r.verse,
          reason: `AI reranked match (${Math.round(relative * 100)}% relative)`,
        };
      });
    } catch (err: any) {
      // Fall through to retrieval-only. Log once, don't retry this session.
      if (!rerankErroredThisSession) {
        console.warn('[Semantic] Reranker runtime failure — falling back to retrieval-only for the rest of this session:', err?.message ?? String(err));
        rerankErroredThisSession = true;
      }
    }
  }

  // Retrieval-only path (unchanged thresholds).
  const minScore = 0.35;
  return candidates
    .filter((c) => c.retrievalScore >= minScore)
    .slice(0, topN)
    .map((c) => ({
      verse: c.verse,
      reason: `Semantic match (${Math.round(c.retrievalScore * 100)}% relevance)`,
    }));
}

export function isSemanticReady(): boolean {
  return isInitialized;
}

// Query words too generic to identify a verse by tag match alone.
const LEXICAL_STOPWORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'in', 'on', 'to', 'for', 'with', 'by',
  'is', 'was', 'are', 'were', 'what', 'who', 'when', 'where', 'why', 'how',
  'story', 'stories', 'about', 'verse', 'verses', 'quran', 'surah', 'ayah',
  'tell', 'me', 'find', 'show',
]);

/**
 * Cheap lexical recall pass over the topic tags. Returns up to `limit`
 * verses whose tags contain the query's significant words, ranked by how
 * many distinct words hit, skipping anything already in `existing`.
 * Runs a substring scan over all 6236 tag strings — sub-10ms on device,
 * vs ~450 cross-encoder passes it replaces.
 *
 * Exported for tests (pure; requires setVerseMeta to have run).
 */
export function lexicalCandidates(
  query: string,
  verses: QuranVerse[],
  limit: number,
  existing: { verse: QuranVerse }[]
): { verse: QuranVerse; retrievalScore: number; topics: string }[] {
  if (!verseTopics) return [];
  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !LEXICAL_STOPWORDS.has(w));
  if (words.length === 0) return [];

  const seen = new Set(existing.map((c) => `${c.verse.surah}:${c.verse.ayah}`));
  const verseLookup = new Map<string, QuranVerse>();
  for (const v of verses) {
    verseLookup.set(`${v.surah}:${v.ayah}`, v);
  }

  const hits: { key: string; count: number }[] = [];
  for (const [key, topics] of verseTopics) {
    if (seen.has(key) || !topics) continue;
    const lower = topics.toLowerCase();
    let count = 0;
    for (const w of words) {
      if (lower.includes(w)) count++;
    }
    if (count > 0) hits.push({ key, count });
  }

  hits.sort((a, b) => b.count - a.count);
  const out: { verse: QuranVerse; retrievalScore: number; topics: string }[] = [];
  for (const h of hits) {
    if (out.length >= limit) break;
    // Require every significant word to hit when the query has few words —
    // single-word overlap on a multi-word query pulls in noise.
    if (words.length > 1 && h.count < words.length) break;
    const verse = verseLookup.get(h.key);
    if (!verse) continue;
    out.push({ verse, retrievalScore: 0, topics: verseTopics.get(h.key) ?? '' });
  }
  return out;
}

/**
 * Simple WordPiece tokenizer using the vocab from tokenizer.json.
 * Exported for tests (pure).
 */
export function tokenize(text: string, tok: TokenizerData, maxLength = 128): number[] {
  const vocab = tok.model.vocab;
  const CLS = vocab['[CLS]'] ?? 101;
  const SEP = vocab['[SEP]'] ?? 102;
  const PAD = vocab['[PAD]'] ?? 0;
  const UNK = vocab['[UNK]'] ?? 100;

  // Lowercase and split into words
  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);

  const tokens: number[] = [CLS];

  for (const word of words) {
    let remaining = word;
    let isFirst = true;

    while (remaining.length > 0 && tokens.length < maxLength - 1) {
      let found = false;

      // Try longest matching subword
      for (let end = remaining.length; end > 0; end--) {
        const subword = isFirst ? remaining.slice(0, end) : `##${remaining.slice(0, end)}`;
        if (subword in vocab) {
          tokens.push(vocab[subword]);
          remaining = remaining.slice(end);
          isFirst = false;
          found = true;
          break;
        }
      }

      if (!found) {
        tokens.push(UNK);
        remaining = remaining.slice(1);
        isFirst = false;
      }
    }
  }

  tokens.push(SEP);

  // Pad to maxLength
  while (tokens.length < maxLength) {
    tokens.push(PAD);
  }

  return tokens.slice(0, maxLength);
}
