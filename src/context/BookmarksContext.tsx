import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  Bookmark,
  addBookmark as persistAdd,
  removeBookmark as persistRemove,
  getBookmarks as persistGet,
  bookmarkKey,
} from '../services/bookmarks';

interface BookmarksContextType {
  bookmarks: Bookmark[];
  bookmarkedKeys: Set<string>;
  ready: boolean;
  isBookmarked: (surah: number, ayah: number) => boolean;
  toggleBookmark: (surah: number, ayah: number) => Promise<'added' | 'removed'>;
  removeBookmark: (surah: number, ayah: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const BookmarksContext = createContext<BookmarksContextType>({
  bookmarks: [],
  bookmarkedKeys: new Set(),
  ready: false,
  isBookmarked: () => false,
  toggleBookmark: async () => 'added',
  removeBookmark: async () => {},
  refresh: async () => {},
});

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const all = await persistGet();
    setBookmarks(all);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await persistGet();
      if (cancelled) return;
      setBookmarks(all);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bookmarkedKeys = useMemo(
    () => new Set(bookmarks.map((b) => bookmarkKey(b.surah, b.ayah))),
    [bookmarks]
  );

  const isBookmarked = useCallback(
    (surah: number, ayah: number) => bookmarkedKeys.has(bookmarkKey(surah, ayah)),
    [bookmarkedKeys]
  );

  const toggleBookmark = useCallback(
    async (surah: number, ayah: number): Promise<'added' | 'removed'> => {
      const key = bookmarkKey(surah, ayah);
      if (bookmarkedKeys.has(key)) {
        await persistRemove(surah, ayah);
        setBookmarks((prev) =>
          prev.filter((b) => bookmarkKey(b.surah, b.ayah) !== key)
        );
        return 'removed';
      }
      await persistAdd(surah, ayah);
      const entry: Bookmark = { surah, ayah, savedAt: Date.now() };
      setBookmarks((prev) => [entry, ...prev]);
      return 'added';
    },
    [bookmarkedKeys]
  );

  const removeBookmarkAction = useCallback(
    async (surah: number, ayah: number) => {
      const key = bookmarkKey(surah, ayah);
      await persistRemove(surah, ayah);
      setBookmarks((prev) =>
        prev.filter((b) => bookmarkKey(b.surah, b.ayah) !== key)
      );
    },
    []
  );

  return (
    <BookmarksContext.Provider
      value={{
        bookmarks,
        bookmarkedKeys,
        ready,
        isBookmarked,
        toggleBookmark,
        removeBookmark: removeBookmarkAction,
        refresh,
      }}
    >
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  return useContext(BookmarksContext);
}
