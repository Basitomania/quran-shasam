/**
 * Tokenizer + lexical-recall tests against the REAL tokenizer vocabularies
 * shipped in assets/. No ONNX involved — these run in milliseconds and pin
 * the exact encoding the models receive.
 */
import { tokenize, lexicalCandidates, setVerseMeta, TokenizerData } from '../../src/services/semanticSearch';
import { encodePair, wordpieceTokenize } from '../../src/services/reranker';
import { QuranVerse } from '../../src/types/quran';

const biTokenizer = require('../../assets/tokenizer.json') as TokenizerData;
const rerankTokenizer = require('../../assets/reranker_tokenizer.json') as TokenizerData;

const vocab = biTokenizer.model.vocab;
const CLS = vocab['[CLS]'];
const SEP = vocab['[SEP]'];
const PAD = vocab['[PAD]'];
const UNK = vocab['[UNK]'];

describe('tokenize (bi-encoder WordPiece)', () => {
  it('wraps a known word in [CLS] ... [SEP] and pads to maxLength', () => {
    const ids = tokenize('mercy', biTokenizer, 16);
    expect(ids).toHaveLength(16);
    expect(ids[0]).toBe(CLS);
    expect(ids[1]).toBe(vocab['mercy']);
    expect(ids[2]).toBe(SEP);
    expect(ids.slice(3)).toEqual(Array(13).fill(PAD));
  });

  it('lowercases before lookup', () => {
    expect(tokenize('MERCY', biTokenizer, 8)).toEqual(tokenize('mercy', biTokenizer, 8));
  });

  it('splits out-of-vocab words into ## subword pieces', () => {
    // "balqis" is not a whole-word vocab entry in MiniLM's vocab.
    expect(vocab['balqis']).toBeUndefined();
    const ids = tokenize('balqis', biTokenizer, 16).filter((id) => id !== PAD);
    // [CLS] + at least 2 subword pieces + [SEP]
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids[0]).toBe(CLS);
    expect(ids[ids.length - 1]).toBe(SEP);
    expect(ids).not.toContain(UNK);
  });

  it('degrades untokenizable input to bare [CLS][SEP] (UNK is unreachable)', () => {
    // The pre-filter regex [^\w\s] strips anything outside [A-Za-z0-9_],
    // and every surviving single char exists in the vocab — so exotic
    // input ("☃") produces an empty token stream, not [UNK]. Characterizes
    // the real behavior; if the pre-filter changes, revisit.
    const ids = tokenize('☃', biTokenizer, 8);
    expect(ids.filter((id) => id !== PAD)).toEqual([CLS, SEP]);
    expect(ids).not.toContain(UNK);
  });

  it('strips punctuation and splits on whitespace', () => {
    expect(tokenize('mercy, mercy!', biTokenizer, 16)).toEqual(
      tokenize('mercy mercy', biTokenizer, 16)
    );
  });

  it('never exceeds maxLength for very long input', () => {
    const long = Array(300).fill('mercy').join(' ');
    expect(tokenize(long, biTokenizer, 128)).toHaveLength(128);
  });
});

describe('wordpieceTokenize (reranker)', () => {
  const rrVocab = rerankTokenizer.model.vocab;

  it('returns raw ids without [CLS]/[SEP]', () => {
    const ids = wordpieceTokenize('mercy', rerankTokenizer, 8);
    expect(ids).toEqual([rrVocab['mercy']]);
  });

  it('respects maxTokens', () => {
    const long = Array(50).fill('mercy').join(' ');
    expect(wordpieceTokenize(long, rerankTokenizer, 10)).toHaveLength(10);
  });

  it('returns [] for maxTokens <= 0', () => {
    expect(wordpieceTokenize('mercy', rerankTokenizer, 0)).toEqual([]);
  });
});

describe('encodePair (reranker input encoding)', () => {
  const rrVocab = rerankTokenizer.model.vocab;
  const RR_CLS = rrVocab['[CLS]'];
  const RR_SEP = rrVocab['[SEP]'];

  it('builds [CLS] query [SEP] passage [SEP] with correct token_type segments', () => {
    const enc = encodePair('mercy', 'forgiveness', rerankTokenizer, 32);
    expect(enc.inputIds[0]).toBe(RR_CLS);

    const sepPositions = enc.inputIds
      .map((id, i) => (id === RR_SEP ? i : -1))
      .filter((i) => i >= 0);
    expect(sepPositions).toHaveLength(2);

    const [querySep, passageSep] = sepPositions;
    // Query segment (incl. its [SEP]) is type 0; passage segment is type 1.
    for (let i = 0; i <= querySep; i++) expect(enc.tokenTypeIds[i]).toBe(0);
    for (let i = querySep + 1; i <= passageSep; i++) expect(enc.tokenTypeIds[i]).toBe(1);
  });

  it('is unpadded: attention mask is all 1s and lengths match', () => {
    const enc = encodePair('mercy', 'forgiveness and patience', rerankTokenizer, 64);
    expect(enc.inputIds.length).toBeLessThan(64);
    expect(enc.attentionMask).toEqual(Array(enc.inputIds.length).fill(1));
    expect(enc.tokenTypeIds).toHaveLength(enc.inputIds.length);
  });

  it('caps the query segment at its 48-token budget', () => {
    const hugeQuery = Array(200).fill('mercy').join(' ');
    const enc = encodePair(hugeQuery, 'short passage', rerankTokenizer, 192);
    const firstSep = enc.inputIds.indexOf(RR_SEP);
    // [CLS] + up to 48 query tokens → SEP at index <= 49.
    expect(firstSep).toBeLessThanOrEqual(49);
  });

  it('truncates an overlong passage to maxLength ending in [SEP]', () => {
    const hugePassage = Array(500).fill('mercy').join(' ');
    const enc = encodePair('short', hugePassage, rerankTokenizer, 64);
    expect(enc.inputIds).toHaveLength(64);
    expect(enc.inputIds[63]).toBe(RR_SEP);
    expect(enc.tokenTypeIds[63]).toBe(1);
    expect(enc.attentionMask[63]).toBe(1);
  });
});

describe('lexicalCandidates (tag-based recall)', () => {
  const verse = (surah: number, ayah: number): QuranVerse => ({
    surah,
    ayah,
    surahNameEnglish: `S${surah}`,
    surahNameArabic: `س${surah}`,
    arabicText: 'نص',
    englishText: 'text',
  });

  const VERSES = [verse(17, 1), verse(27, 22), verse(2, 255), verse(54, 1)];

  beforeAll(() => {
    setVerseMeta([
      { s: 17, a: 1, t: 'Isra, Night Journey, Miraj, Al-Aqsa' },
      { s: 27, a: 22, t: 'Balqis, Queen of Sheba, hoopoe, Sulayman' },
      { s: 2, a: 255, t: 'Ayat al-Kursi, throne verse, protection' },
      { s: 54, a: 1, t: 'moon split, Hour drawn near' },
    ]);
  });

  it('finds a verse whose tags contain the query word', () => {
    const out = lexicalCandidates('balqis', VERSES, 25, []);
    expect(out.map((c) => `${c.verse.surah}:${c.verse.ayah}`)).toEqual(['27:22']);
  });

  it('requires ALL significant words to hit for multi-word queries', () => {
    // "night" hits 17:1; "journey" hits 17:1; both → included.
    const both = lexicalCandidates('night journey', VERSES, 25, []);
    expect(both.map((c) => `${c.verse.surah}:${c.verse.ayah}`)).toEqual(['17:1']);

    // "night throne": no verse has both words → nothing.
    const none = lexicalCandidates('night throne', VERSES, 25, []);
    expect(none).toEqual([]);
  });

  it('ignores stopwords and short words', () => {
    // "story of the balqis" → only "balqis" is significant.
    const out = lexicalCandidates('story of the balqis', VERSES, 25, []);
    expect(out.map((c) => `${c.verse.surah}:${c.verse.ayah}`)).toEqual(['27:22']);
  });

  it('returns [] when the query has no significant words', () => {
    expect(lexicalCandidates('the of me', VERSES, 25, [])).toEqual([]);
  });

  it('skips verses already in the existing candidate pool', () => {
    const existing = [{ verse: VERSES[1] }]; // 27:22 already retrieved
    expect(lexicalCandidates('balqis', VERSES, 25, existing)).toEqual([]);
  });

  it('respects the limit', () => {
    const out = lexicalCandidates('balqis', VERSES, 0, []);
    expect(out).toEqual([]);
  });

  it('is case-insensitive', () => {
    const out = lexicalCandidates('BALQIS', VERSES, 25, []);
    expect(out).toHaveLength(1);
  });
});
