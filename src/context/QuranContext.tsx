import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { QuranVerse } from '../types/quran';
import { loadQuranData } from '../services/quranDataLoader';
import { VerseMatcher } from '../services/verseMatcher';
import { loadSearchIndex } from '../services/localThematicSearch';
import { initSemanticSearch, setVerseMeta } from '../services/semanticSearch';
import { initReranker } from '../services/reranker';

import keywordIndexData from '../../assets/keyword_index.json';
import verseIndexData from '../../assets/verse_index.json';
import tokenizerData from '../../assets/tokenizer.json';
import rerankerTokenizerData from '../../assets/reranker_tokenizer.json';

interface QuranContextType {
  verses: QuranVerse[];
  matcher: VerseMatcher | null;
  searchReady: boolean;
  semanticReady: boolean;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  retry: () => void;
}

const QuranContext = createContext<QuranContextType>({
  verses: [],
  matcher: null,
  searchReady: false,
  semanticReady: false,
  isLoading: true,
  loadingMessage: '',
  error: null,
  retry: () => {},
});

export function QuranProvider({ children }: { children: React.ReactNode }) {
  const [verses, setVerses] = useState<QuranVerse[]>([]);
  const [matcher, setMatcher] = useState<VerseMatcher | null>(null);
  const [searchReady, setSearchReady] = useState(false);
  const [semanticReady, setSemanticReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setLoadingMessage('Initializing...');
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadQuranData(setLoadingMessage);
        if (cancelled) return;
        setVerses(data);

        setLoadingMessage('Building search index...');
        const m = new VerseMatcher(data);
        if (cancelled) return;
        setMatcher(m);

        setLoadingMessage('Loading thematic search...');
        await loadSearchIndex(keywordIndexData as any, verseIndexData as any);
        if (cancelled) return;
        setSearchReady(true);

        // App is ready — show the UI now
        setIsLoading(false);

        // Load semantic search in background (don't block the app)
        console.log('[QuranContext] Starting semantic search init in background...');
        console.log('[QuranContext] verseIndexData length:', (verseIndexData as any)?.length);
        console.log('[QuranContext] tokenizerData vocab:', tokenizerData?.model?.vocab ? Object.keys(tokenizerData.model.vocab).length : 'missing');
        setVerseMeta(verseIndexData as any);
        initSemanticSearch(tokenizerData, (msg) => console.log('[Semantic Progress]', msg))
          .then((ok) => {
            console.log('[QuranContext] Semantic init resolved:', ok);
            if (!cancelled) setSemanticReady(ok);

            // Chain reranker init in the background. Never await it on the
            // startup critical path — same rule as the bi-encoder. If it
            // fails, semanticSearch keeps the retrieval-only path.
            if (ok) {
              console.log('[QuranContext] Starting reranker init in background...');
              initReranker(rerankerTokenizerData)
                .then((rerankerOk) => {
                  console.log('[QuranContext] Reranker init resolved:', rerankerOk);
                })
                .catch((err) => {
                  console.warn('[QuranContext] Reranker init rejected:', err?.message);
                });
            }
          })
          .catch((err) => {
            console.error('[QuranContext] Semantic init rejected:', err?.message);
            if (!cancelled) setSemanticReady(false);
          });
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Failed to load Quran data');
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  return (
    <QuranContext.Provider
      value={{ verses, matcher, searchReady, semanticReady, isLoading, loadingMessage, error, retry }}
    >
      {children}
    </QuranContext.Provider>
  );
}

export function useQuranData() {
  return useContext(QuranContext);
}
