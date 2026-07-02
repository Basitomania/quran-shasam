/**
 * Bookmarks storage tests. The storage key and record shape are the
 * persistence contract — the key string below is intentionally a hardcoded
 * literal (NOT imported from the module) so an accidental key rename or
 * format change breaks these tests loudly. Changing either requires a
 * versioned migration (v1 → v2), not an edit here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addBookmark,
  removeBookmark,
  isBookmarked,
  getBookmarks,
  bookmarkKey,
} from '../bookmarks';

const STORAGE_KEY_V1 = '@quranshasam/bookmarks/v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('storage format (v1 contract)', () => {
  it('persists under the literal v1 key with the pinned record shape', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    await addBookmark(2, 255);

    const raw = await AsyncStorage.getItem(STORAGE_KEY_V1);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual([{ surah: 2, ayah: 255, savedAt: 1700000000000 }]);
  });

  it('stores nothing under any other key', async () => {
    await addBookmark(1, 1);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual([STORAGE_KEY_V1]);
  });
});

describe('addBookmark', () => {
  it('is idempotent for the same surah:ayah', async () => {
    await addBookmark(18, 10);
    await addBookmark(18, 10);
    expect(await getBookmarks()).toHaveLength(1);
  });

  it('stores multiple distinct verses', async () => {
    await addBookmark(18, 10);
    await addBookmark(2, 255);
    expect(await getBookmarks()).toHaveLength(2);
  });
});

describe('getBookmarks', () => {
  it('returns newest first', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    await addBookmark(1, 1);
    now.mockReturnValue(2000);
    await addBookmark(2, 2);
    now.mockReturnValue(1500);
    await addBookmark(3, 3);

    const refs = (await getBookmarks()).map((b) => `${b.surah}:${b.ayah}`);
    expect(refs).toEqual(['2:2', '3:3', '1:1']);
  });

  it('recovers from corrupted JSON by returning []', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(STORAGE_KEY_V1, '{not valid json!');
    expect(await getBookmarks()).toEqual([]);
  });

  it('recovers from a non-array payload by returning []', async () => {
    await AsyncStorage.setItem(STORAGE_KEY_V1, JSON.stringify({ nope: true }));
    expect(await getBookmarks()).toEqual([]);
  });

  it('filters malformed entries but keeps valid ones', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify([
        { surah: 1, ayah: 1, savedAt: 1 },
        { surah: 'x', ayah: 2, savedAt: 2 },
        { ayah: 3, savedAt: 3 },
        null,
      ])
    );
    const all = await getBookmarks();
    expect(all).toEqual([{ surah: 1, ayah: 1, savedAt: 1 }]);
  });

  it('returns [] on empty storage', async () => {
    expect(await getBookmarks()).toEqual([]);
  });
});

describe('removeBookmark', () => {
  it('removes an existing bookmark', async () => {
    await addBookmark(18, 10);
    await removeBookmark(18, 10);
    expect(await isBookmarked(18, 10)).toBe(false);
  });

  it('is a no-op for a bookmark that does not exist', async () => {
    await addBookmark(18, 10);
    await removeBookmark(99, 99);
    expect(await getBookmarks()).toHaveLength(1);
  });
});

describe('isBookmarked', () => {
  it('reflects add/remove state', async () => {
    expect(await isBookmarked(2, 255)).toBe(false);
    await addBookmark(2, 255);
    expect(await isBookmarked(2, 255)).toBe(true);
  });
});

describe('bookmarkKey', () => {
  it('formats as surah:ayah', () => {
    expect(bookmarkKey(2, 255)).toBe('2:255');
  });
});
