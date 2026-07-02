import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@quranshasam/bookmarks/v1';

export interface Bookmark {
  surah: number;
  ayah: number;
  savedAt: number; // epoch ms
  note?: string;   // reserved for v2
}

function makeId(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

async function readAll(): Promise<Bookmark[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter any malformed entries defensively.
    return parsed.filter(
      (b): b is Bookmark =>
        b &&
        typeof b.surah === 'number' &&
        typeof b.ayah === 'number' &&
        typeof b.savedAt === 'number'
    );
  } catch (err) {
    console.warn('[bookmarks] failed to read:', err);
    return [];
  }
}

async function writeAll(bookmarks: Bookmark[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (err) {
    console.warn('[bookmarks] failed to write:', err);
    throw err;
  }
}

/** Returns all bookmarks, newest first. */
export async function getBookmarks(): Promise<Bookmark[]> {
  const all = await readAll();
  return [...all].sort((a, b) => b.savedAt - a.savedAt);
}

export async function addBookmark(surah: number, ayah: number): Promise<void> {
  const all = await readAll();
  const id = makeId(surah, ayah);
  if (all.some((b) => makeId(b.surah, b.ayah) === id)) return;
  all.push({ surah, ayah, savedAt: Date.now() });
  await writeAll(all);
}

export async function removeBookmark(surah: number, ayah: number): Promise<void> {
  const all = await readAll();
  const id = makeId(surah, ayah);
  const next = all.filter((b) => makeId(b.surah, b.ayah) !== id);
  if (next.length !== all.length) {
    await writeAll(next);
  }
}

export async function isBookmarked(surah: number, ayah: number): Promise<boolean> {
  const all = await readAll();
  const id = makeId(surah, ayah);
  return all.some((b) => makeId(b.surah, b.ayah) === id);
}

export function bookmarkKey(surah: number, ayah: number): string {
  return makeId(surah, ayah);
}
