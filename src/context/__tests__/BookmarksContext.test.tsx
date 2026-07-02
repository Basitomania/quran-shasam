/**
 * BookmarksContext tests. Uses the REAL bookmarks service on top of the
 * AsyncStorage mock from test/setup.unit.js, so these also exercise the
 * context <-> service <-> storage round-trip.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { BookmarksProvider, useBookmarks } from '../BookmarksContext';

const STORAGE_KEY_V1 = '@quranshasam/bookmarks/v1';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BookmarksProvider>{children}</BookmarksProvider>
);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('mount', () => {
  it('reads persisted bookmarks from storage and flips ready', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify([{ surah: 2, ayah: 255, savedAt: 1000 }])
    );

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.bookmarks).toEqual([
      { surah: 2, ayah: 255, savedAt: 1000 },
    ]);
    expect(result.current.isBookmarked(2, 255)).toBe(true);
    expect(result.current.isBookmarked(1, 1)).toBe(false);
  });

  it('starts empty when storage is empty', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.bookmarkedKeys.size).toBe(0);
  });
});

describe('toggleBookmark', () => {
  it("returns 'added' then 'removed' and keeps Set membership in sync", async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: 'added' | 'removed' = 'removed';
    await act(async () => {
      outcome = await result.current.toggleBookmark(18, 10);
    });
    expect(outcome).toBe('added');
    expect(result.current.isBookmarked(18, 10)).toBe(true);
    expect(result.current.bookmarkedKeys.has('18:10')).toBe(true);

    await act(async () => {
      outcome = await result.current.toggleBookmark(18, 10);
    });
    expect(outcome).toBe('removed');
    expect(result.current.isBookmarked(18, 10)).toBe(false);
    expect(result.current.bookmarkedKeys.has('18:10')).toBe(false);
  });

  it('persists through the bookmarks service to the v1 key', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.toggleBookmark(1, 5);
    });

    const raw = await AsyncStorage.getItem(STORAGE_KEY_V1);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ surah: 1, ayah: 5 });

    // Removing empties the persisted array too.
    await act(async () => {
      await result.current.toggleBookmark(1, 5);
    });
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY_V1)) as string)).toEqual([]);
  });
});

describe('refresh', () => {
  it('picks up storage changed behind its back', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.bookmarks).toEqual([]);

    // Simulate another writer mutating storage directly.
    await AsyncStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify([{ surah: 36, ayah: 1, savedAt: 42 }])
    );
    expect(result.current.isBookmarked(36, 1)).toBe(false);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.isBookmarked(36, 1)).toBe(true);
    expect(result.current.bookmarks).toEqual([{ surah: 36, ayah: 1, savedAt: 42 }]);
  });
});

describe('cancellation flag', () => {
  it('unmounting mid-load does not warn (no setState after unmount)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Hold the initial storage read open until after unmount.
    let release: (value: string | null) => void = () => {};
    const gate = new Promise<string | null>((resolve) => {
      release = resolve;
    });
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(gate);

    const { unmount } = renderHook(() => useBookmarks(), { wrapper });
    unmount();

    await act(async () => {
      release(JSON.stringify([{ surah: 2, ayah: 2, savedAt: 1 }]));
      await gate;
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
