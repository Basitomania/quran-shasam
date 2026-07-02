/**
 * Cross-encoder reranker for semantic search precision.
 *
 * Sits on top of the bi-encoder retrieval stage. The bi-encoder pulls a
 * top-K candidate shortlist from the frozen 384-dim verse index; this
 * reranker reads each (query, verse_english) pair jointly and produces
 * a relevance logit that we then sigmoid → 0..1 and sort by.
 *
 * Model: cross-encoder/ms-marco-MiniLM-L-6-v2, int8-quantized ONNX.
 * Loads via expo-file-system v19+ JSI (`new File(uri).bytes()`) — the
 * same load-bearing pattern semanticSearch.ts uses. Never `readAsStringAsync + atob`.
 * The `file://` prefix is stripped before `InferenceSession.create`.
 *
 * Non-throwing init: `initReranker` returns false on failure and the
 * caller keeps the retrieval-only path. `rerank` throws on runtime failure
 * so the caller can fall back within a single query.
 */

import { File as ExpoFile } from 'expo-file-system';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import { QuranVerse } from '../types/quran';

// Tunables — top of file per spec.
const MAX_LENGTH = 192;
const MAX_BATCH = 25;

export interface TokenizerData {
  model: {
    vocab: { [token: string]: number };
  };
}

// Module state
let session: InferenceSession | null = null;
let tokenizer: TokenizerData | null = null;
let isInitialized = false;

/**
 * Initialize the cross-encoder reranker.
 * Non-throwing: returns false on any failure. The caller keeps the
 * retrieval-only path when this returns false.
 */
export async function initReranker(tokenizerData: any): Promise<boolean> {
  try {
    console.log('[Reranker] === INIT START ===');

    tokenizer = tokenizerData as TokenizerData;
    const vocabSize = tokenizer?.model?.vocab
      ? Object.keys(tokenizer.model.vocab).length
      : 0;
    console.log('[Reranker] Tokenizer loaded, vocab size:', vocabSize);
    if (vocabSize === 0) {
      throw new Error('Reranker tokenizer has empty vocab');
    }

    console.log('[Reranker] Loading ONNX asset...');
    const modelAsset = Asset.fromModule(require('../../assets/reranker.onnx'));
    await modelAsset.downloadAsync();
    if (!modelAsset.localUri) throw new Error('Failed to download reranker ONNX');
    console.log('[Reranker] Model localUri:', modelAsset.localUri);

    // onnxruntime needs a raw file path, not a file:// URI (same rule as bi-encoder)
    const modelPath = modelAsset.localUri.replace('file://', '');
    console.log('[Reranker] Model path (stripped):', modelPath);

    const t0 = Date.now();
    session = await InferenceSession.create(modelPath);
    console.log('[Reranker] InferenceSession created in', Date.now() - t0, 'ms');

    isInitialized = true;
    console.log('[Reranker] === INIT COMPLETE ===');
    return true;
  } catch (err: any) {
    console.error('[Reranker] === INIT FAILED ===');
    console.error('[Reranker] Error:', String(err));
    console.error('[Reranker] Error message:', err?.message);
    console.error('[Reranker] Error stack:', err?.stack);
    session = null;
    tokenizer = null;
    isInitialized = false;
    return false;
  }
}

export function isRerankerReady(): boolean {
  return isInitialized;
}

/**
 * Rerank a shortlist of candidates by joint (query, passage) relevance.
 *
 * Returns the input list reordered by descending sigmoid(logit). Scores
 * are in [0, 1] and directly comparable within a single call.
 *
 * Throws on runtime failure (OOM, session error). The caller should
 * catch and fall back to retrieval-only ordering.
 */
export async function rerank(
  query: string,
  candidates: { verse: QuranVerse; retrievalScore: number; topics?: string }[],
  topN: number = 10
): Promise<{ verse: QuranVerse; score: number }[]> {
  if (!isInitialized || !session || !tokenizer) {
    throw new Error('Reranker not initialized');
  }
  if (candidates.length === 0) return [];

  const scored: { verse: QuranVerse; score: number }[] = [];

  // Chunk into batches of MAX_BATCH.
  for (let start = 0; start < candidates.length; start += MAX_BATCH) {
    const batch = candidates.slice(start, start + MAX_BATCH);
    const batchSize = batch.length;

    // Encode every pair unpadded first, then pad the batch to its own
    // longest sequence (capped at MAX_LENGTH) instead of always padding
    // to MAX_LENGTH. Transformer attention cost is quadratic in sequence
    // length; typical (query, verse, tags) pairs run ~100-130 tokens, so
    // this alone roughly halves inference time.
    const encodedRows: { inputIds: number[]; attentionMask: number[]; tokenTypeIds: number[] }[] = [];
    let seqLen = 0;
    for (let b = 0; b < batchSize; b++) {
      // Passage = translation + topic tags. The tags carry entity names
      // ("Balqis", "Dhul-Qarnayn") that never appear in the translation;
      // without them the cross-encoder demotes exactly the verses the
      // enriched retrieval surfaced. Cap tags at ~40 words so the
      // translation still dominates the token window.
      const tags = (batch[b].topics || '').split(/\s+/).slice(0, 40).join(' ');
      const passage = `${batch[b].verse.englishText || ''}${tags ? ` Topics: ${tags}` : ''}`;
      const encoded = encodePair(query, passage, tokenizer, MAX_LENGTH);
      encodedRows.push(encoded);
      if (encoded.inputIds.length > seqLen) seqLen = encoded.inputIds.length;
    }

    const inputIds = new BigInt64Array(batchSize * seqLen);
    const attentionMask = new BigInt64Array(batchSize * seqLen);
    const tokenTypeIds = new BigInt64Array(batchSize * seqLen);
    for (let b = 0; b < batchSize; b++) {
      const row = encodedRows[b];
      const rowOffset = b * seqLen;
      for (let t = 0; t < row.inputIds.length; t++) {
        inputIds[rowOffset + t] = BigInt(row.inputIds[t]);
        attentionMask[rowOffset + t] = BigInt(row.attentionMask[t]);
        tokenTypeIds[rowOffset + t] = BigInt(row.tokenTypeIds[t]);
      }
      // Remaining positions stay 0 ([PAD] id 0, mask 0, type 0).
    }

    const inputIdsTensor = new Tensor('int64', inputIds, [batchSize, seqLen]);
    const attentionMaskTensor = new Tensor('int64', attentionMask, [batchSize, seqLen]);
    const tokenTypeIdsTensor = new Tensor('int64', tokenTypeIds, [batchSize, seqLen]);

    const results = await session.run({
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    });

    // MS MARCO cross-encoder outputs a single logit per pair (shape [batch, 1] or [batch]).
    const outputKey = Object.keys(results)[0];
    const outputData = results[outputKey].data as Float32Array;
    // outputData length should be batchSize (or batchSize * 1). Take one per row.
    const stride = outputData.length / batchSize;

    for (let b = 0; b < batchSize; b++) {
      // Store raw logit. MS-MARCO cross-encoder logits sit deep in the
      // negative range for most passages; sigmoid would compress the whole
      // shortlist into ~0 and lose the relative ordering signal. The caller
      // does its own normalization for display.
      scored.push({ verse: batch[b].verse, score: outputData[b * stride] });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * Encode a (query, passage) pair as [CLS] query [SEP] passage [SEP],
 * truncated to maxLength but NOT padded — the caller pads the batch to
 * its own longest row. token_type_ids: 0 for the query segment
 * (including its [SEP]), 1 for the passage segment.
 *
 * Exported for tests (pure).
 */
export function encodePair(
  query: string,
  passage: string,
  tok: TokenizerData,
  maxLength: number
): { inputIds: number[]; attentionMask: number[]; tokenTypeIds: number[] } {
  const vocab = tok.model.vocab;
  const CLS = vocab['[CLS]'] ?? 101;
  const SEP = vocab['[SEP]'] ?? 102;

  // We need [CLS] queryTokens [SEP] passageTokens [SEP], total <= maxLength.
  // Reserve 3 slots for special tokens.
  // Give the query up to ~48 tokens (queries are short); rest goes to passage.
  const queryBudget = 48;
  const queryTokens = wordpieceTokenize(query, tok, queryBudget);
  const passageBudget = maxLength - 3 - queryTokens.length;
  const passageTokens = wordpieceTokenize(passage, tok, Math.max(passageBudget, 0));

  const inputIds: number[] = [CLS, ...queryTokens, SEP, ...passageTokens, SEP];
  const tokenTypeIds: number[] = [
    0, // [CLS]
    ...queryTokens.map(() => 0),
    0, // [SEP] after query — HF convention: belongs to query segment
    ...passageTokens.map(() => 1),
    1, // final [SEP] belongs to passage segment
  ];
  const attentionMask: number[] = inputIds.map(() => 1);

  // Truncate if we overshot (guard).
  if (inputIds.length > maxLength) {
    inputIds.length = maxLength;
    tokenTypeIds.length = maxLength;
    attentionMask.length = maxLength;
    // Force the final token to [SEP] so the model still sees a segment terminator.
    inputIds[maxLength - 1] = SEP;
    tokenTypeIds[maxLength - 1] = 1;
    attentionMask[maxLength - 1] = 1;
  }

  return { inputIds, attentionMask, tokenTypeIds };
}

/**
 * Greedy WordPiece tokenizer, matches the style used by semanticSearch.tokenize.
 * Returns raw token IDs (no [CLS]/[SEP]) up to `maxTokens`.
 * Exported for tests (pure).
 */
export function wordpieceTokenize(
  text: string,
  tok: TokenizerData,
  maxTokens: number
): number[] {
  if (maxTokens <= 0) return [];
  const vocab = tok.model.vocab;
  const UNK = vocab['[UNK]'] ?? 100;

  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  const tokens: number[] = [];

  for (const word of words) {
    let remaining = word;
    let isFirst = true;

    while (remaining.length > 0 && tokens.length < maxTokens) {
      let found = false;

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

    if (tokens.length >= maxTokens) break;
  }

  return tokens;
}
