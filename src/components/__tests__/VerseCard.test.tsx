/**
 * VerseCard tests. Native side-effect modules (haptics, clipboard) and the
 * bookmarks hook boundary are mocked; the card renders for real so text,
 * testIDs, and action wiring are exercised.
 */
import React from 'react';
import { Share } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Ionicons loads its font asynchronously and setStates outside act — render
// a null stand-in to keep tests deterministic.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));

const mockToggleBookmark = jest.fn();
const mockIsBookmarked = jest.fn();
jest.mock('../../context/BookmarksContext', () => ({
  useBookmarks: () => ({
    isBookmarked: mockIsBookmarked,
    toggleBookmark: mockToggleBookmark,
  }),
}));

import * as Clipboard from 'expo-clipboard';
import { VerseCard } from '../VerseCard';
import { testIDs } from '../../testIDs';
import { formatVerseForShare } from '../../utils/formatVerse';
import { FIXTURE_VERSES } from '../../../test/fixtures/verses.small';

const verse = FIXTURE_VERSES[0]; // Al-Faatiha 1:1 — has both arabic + english

beforeEach(() => {
  jest.clearAllMocks();
  mockIsBookmarked.mockReturnValue(false);
  mockToggleBookmark.mockResolvedValue('added');
});

describe('rendering', () => {
  it('shows arabic text, english translation, and the surah reference', () => {
    const { getByText } = render(<VerseCard verse={verse} />);
    expect(getByText(verse.arabicText)).toBeTruthy();
    expect(getByText(verse.englishText)).toBeTruthy();
    expect(getByText(`${verse.surah}:${verse.ayah}`)).toBeTruthy();
    expect(getByText(verse.surahNameEnglish)).toBeTruthy();
    expect(getByText(verse.surahNameArabic)).toBeTruthy();
  });

  it('resolves all registry testIDs for this verse', () => {
    const { getByTestId } = render(<VerseCard verse={verse} score={85} />);
    expect(getByTestId(testIDs.verseCard.card(verse.surah, verse.ayah))).toBeTruthy();
    expect(getByTestId(testIDs.verseCard.bookmark(verse.surah, verse.ayah))).toBeTruthy();
    expect(getByTestId(testIDs.verseCard.copy(verse.surah, verse.ayah))).toBeTruthy();
    expect(getByTestId(testIDs.verseCard.share(verse.surah, verse.ayah))).toBeTruthy();
  });
});

describe('bookmark action', () => {
  it('calls toggleBookmark with the verse reference', async () => {
    const { getByTestId } = render(<VerseCard verse={verse} />);

    fireEvent.press(getByTestId(testIDs.verseCard.bookmark(verse.surah, verse.ayah)));

    await waitFor(() =>
      expect(mockToggleBookmark).toHaveBeenCalledWith(verse.surah, verse.ayah)
    );
    expect(mockToggleBookmark).toHaveBeenCalledTimes(1);
  });
});

describe('copy action', () => {
  it('puts formatVerseForShare(verse) output on the clipboard', async () => {
    const { getByTestId } = render(<VerseCard verse={verse} />);

    fireEvent.press(getByTestId(testIDs.verseCard.copy(verse.surah, verse.ayah)));

    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(formatVerseForShare(verse))
    );
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  });
});

describe('share action', () => {
  it('shares the formatVerseForShare(verse) message', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as any);

    const { getByTestId } = render(<VerseCard verse={verse} />);
    fireEvent.press(getByTestId(testIDs.verseCard.share(verse.surah, verse.ayah)));

    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith({ message: formatVerseForShare(verse) })
    );
  });
});
