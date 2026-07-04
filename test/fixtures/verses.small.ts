// Thirty real verses extracted from assets/verse_index.json for unit tests.
// Regenerate via the snippet in .claude/spec/features/014-test-suite.md if the
// index schema changes.
import { QuranVerse } from '../../src/types/quran';

export const FIXTURE_VERSES: QuranVerse[] = [
  {
    "surah": 1,
    "ayah": 1,
    "surahNameEnglish": "Al-Faatiha",
    "surahNameArabic": "سُورَةُ ٱلْفَاتِحَةِ",
    "arabicText": "﻿بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    "englishText": "In the name of Allah, the Entirely Merciful, the Especially Merciful."
  },
  {
    "surah": 1,
    "ayah": 2,
    "surahNameEnglish": "Al-Faatiha",
    "surahNameArabic": "سُورَةُ ٱلْفَاتِحَةِ",
    "arabicText": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ",
    "englishText": "[All] praise is [due] to Allah, Lord of the worlds -"
  },
  {
    "surah": 1,
    "ayah": 5,
    "surahNameEnglish": "Al-Faatiha",
    "surahNameArabic": "سُورَةُ ٱلْفَاتِحَةِ",
    "arabicText": "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
    "englishText": "It is You we worship and You we ask for help."
  },
  {
    "surah": 2,
    "ayah": 255,
    "surahNameEnglish": "Al-Baqara",
    "surahNameArabic": "سُورَةُ البَقَرَةِ",
    "arabicText": "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌۭ وَلَا نَوْمٌۭ ۚ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍۢ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ",
    "englishText": "Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is [presently] before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great."
  },
  {
    "surah": 2,
    "ayah": 127,
    "surahNameEnglish": "Al-Baqara",
    "surahNameArabic": "سُورَةُ البَقَرَةِ",
    "arabicText": "وَإِذْ يَرْفَعُ إِبْرَٰهِۦمُ ٱلْقَوَاعِدَ مِنَ ٱلْبَيْتِ وَإِسْمَٰعِيلُ رَبَّنَا تَقَبَّلْ مِنَّآ ۖ إِنَّكَ أَنتَ ٱلسَّمِيعُ ٱلْعَلِيمُ",
    "englishText": "And [mention] when Abraham was raising the foundations of the House and [with him] Ishmael, [saying], \"Our Lord, accept [this] from us. Indeed You are the Hearing, the Knowing."
  },
  {
    "surah": 2,
    "ayah": 152,
    "surahNameEnglish": "Al-Baqara",
    "surahNameArabic": "سُورَةُ البَقَرَةِ",
    "arabicText": "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ وَٱشْكُرُوا۟ لِى وَلَا تَكْفُرُونِ",
    "englishText": "So remember Me; I will remember you. And be grateful to Me and do not deny Me."
  },
  {
    "surah": 2,
    "ayah": 153,
    "surahNameEnglish": "Al-Baqara",
    "surahNameArabic": "سُورَةُ البَقَرَةِ",
    "arabicText": "يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ ۚ إِنَّ ٱللَّهَ مَعَ ٱلصَّٰبِرِينَ",
    "englishText": "O you who have believed, seek help through patience and prayer. Indeed, Allah is with the patient."
  },
  {
    "surah": 3,
    "ayah": 2,
    "surahNameEnglish": "Aal-i-Imraan",
    "surahNameArabic": "سُورَةُ آلِ عِمۡرَانَ",
    "arabicText": "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ",
    "englishText": "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence."
  },
  {
    "surah": 3,
    "ayah": 123,
    "surahNameEnglish": "Aal-i-Imraan",
    "surahNameArabic": "سُورَةُ آلِ عِمۡرَانَ",
    "arabicText": "وَلَقَدْ نَصَرَكُمُ ٱللَّهُ بِبَدْرٍۢ وَأَنتُمْ أَذِلَّةٌۭ ۖ فَٱتَّقُوا۟ ٱللَّهَ لَعَلَّكُمْ تَشْكُرُونَ",
    "englishText": "And already had Allah given you victory at [the battle of] Badr while you were few in number. Then fear Allah; perhaps you will be grateful."
  },
  {
    "surah": 12,
    "ayah": 4,
    "surahNameEnglish": "Yusuf",
    "surahNameArabic": "سُورَةُ يُوسُفَ",
    "arabicText": "إِذْ قَالَ يُوسُفُ لِأَبِيهِ يَٰٓأَبَتِ إِنِّى رَأَيْتُ أَحَدَ عَشَرَ كَوْكَبًۭا وَٱلشَّمْسَ وَٱلْقَمَرَ رَأَيْتُهُمْ لِى سَٰجِدِينَ",
    "englishText": "[Of these stories mention] when Joseph said to his father, \"O my father, indeed I have seen [in a dream] eleven stars and the sun and the moon; I saw them prostrating to me.\""
  },
  {
    "surah": 12,
    "ayah": 8,
    "surahNameEnglish": "Yusuf",
    "surahNameArabic": "سُورَةُ يُوسُفَ",
    "arabicText": "إِذْ قَالُوا۟ لَيُوسُفُ وَأَخُوهُ أَحَبُّ إِلَىٰٓ أَبِينَا مِنَّا وَنَحْنُ عُصْبَةٌ إِنَّ أَبَانَا لَفِى ضَلَٰلٍۢ مُّبِينٍ",
    "englishText": "When they said, \"Joseph and his brother are more beloved to our father than we, while we are a clan. Indeed, our father is in clear error."
  },
  {
    "surah": 17,
    "ayah": 1,
    "surahNameEnglish": "Al-Israa",
    "surahNameArabic": "سُورَةُ الإِسۡرَاءِ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ سُبْحَٰنَ ٱلَّذِىٓ أَسْرَىٰ بِعَبْدِهِۦ لَيْلًۭا مِّنَ ٱلْمَسْجِدِ ٱلْحَرَامِ إِلَى ٱلْمَسْجِدِ ٱلْأَقْصَا ٱلَّذِى بَٰرَكْنَا حَوْلَهُۥ لِنُرِيَهُۥ مِنْ ءَايَٰتِنَآ ۚ إِنَّهُۥ هُوَ ٱلسَّمِيعُ ٱلْبَصِيرُ",
    "englishText": "Exalted is He who took His Servant by night from al-Masjid al-Haram to al-Masjid al-Aqsa, whose surroundings We have blessed, to show him of Our signs. Indeed, He is the Hearing, the Seeing."
  },
  {
    "surah": 18,
    "ayah": 10,
    "surahNameEnglish": "Al-Kahf",
    "surahNameArabic": "سُورَةُ الكَهۡفِ",
    "arabicText": "إِذْ أَوَى ٱلْفِتْيَةُ إِلَى ٱلْكَهْفِ فَقَالُوا۟ رَبَّنَآ ءَاتِنَا مِن لَّدُنكَ رَحْمَةًۭ وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًۭا",
    "englishText": "[Mention] when the youths retreated to the cave and said, \"Our Lord, grant us from Yourself mercy and prepare for us from our affair right guidance.\""
  },
  {
    "surah": 18,
    "ayah": 83,
    "surahNameEnglish": "Al-Kahf",
    "surahNameArabic": "سُورَةُ الكَهۡفِ",
    "arabicText": "وَيَسْـَٔلُونَكَ عَن ذِى ٱلْقَرْنَيْنِ ۖ قُلْ سَأَتْلُوا۟ عَلَيْكُم مِّنْهُ ذِكْرًا",
    "englishText": "And they ask you, [O Muhammad], about Dhul-Qarnayn. Say, \"I will recite to you about him a report.\""
  },
  {
    "surah": 19,
    "ayah": 16,
    "surahNameEnglish": "Maryam",
    "surahNameArabic": "سُورَةُ مَرۡيَمَ",
    "arabicText": "وَٱذْكُرْ فِى ٱلْكِتَٰبِ مَرْيَمَ إِذِ ٱنتَبَذَتْ مِنْ أَهْلِهَا مَكَانًۭا شَرْقِيًّۭا",
    "englishText": "And mention, [O Muhammad], in the Book [the story of] Mary, when she withdrew from her family to a place toward the east."
  },
  {
    "surah": 27,
    "ayah": 22,
    "surahNameEnglish": "An-Naml",
    "surahNameArabic": "سُورَةُ النَّمۡلِ",
    "arabicText": "فَمَكَثَ غَيْرَ بَعِيدٍۢ فَقَالَ أَحَطتُ بِمَا لَمْ تُحِطْ بِهِۦ وَجِئْتُكَ مِن سَبَإٍۭ بِنَبَإٍۢ يَقِينٍ",
    "englishText": "But the hoopoe stayed not long and said, \"I have encompassed [in knowledge] that which you have not encompassed, and I have come to you from Sheba with certain news."
  },
  {
    "surah": 27,
    "ayah": 23,
    "surahNameEnglish": "An-Naml",
    "surahNameArabic": "سُورَةُ النَّمۡلِ",
    "arabicText": "إِنِّى وَجَدتُّ ٱمْرَأَةًۭ تَمْلِكُهُمْ وَأُوتِيَتْ مِن كُلِّ شَىْءٍۢ وَلَهَا عَرْشٌ عَظِيمٌۭ",
    "englishText": "Indeed, I found [there] a woman ruling them, and she has been given of all things, and she has a great throne."
  },
  {
    "surah": 27,
    "ayah": 44,
    "surahNameEnglish": "An-Naml",
    "surahNameArabic": "سُورَةُ النَّمۡلِ",
    "arabicText": "قِيلَ لَهَا ٱدْخُلِى ٱلصَّرْحَ ۖ فَلَمَّا رَأَتْهُ حَسِبَتْهُ لُجَّةًۭ وَكَشَفَتْ عَن سَاقَيْهَا ۚ قَالَ إِنَّهُۥ صَرْحٌۭ مُّمَرَّدٌۭ مِّن قَوَارِيرَ ۗ قَالَتْ رَبِّ إِنِّى ظَلَمْتُ نَفْسِى وَأَسْلَمْتُ مَعَ سُلَيْمَٰنَ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ",
    "englishText": "She was told, \"Enter the palace.\" But when she saw it, she thought it was a body of water and uncovered her shins [to wade through]. He said, \"Indeed, it is a palace [whose floor is] made smooth with glass.\" She said, \"My Lord, indeed I have wronged myself, and I submit with Solomon to Allah, Lord of the worlds.\""
  },
  {
    "surah": 36,
    "ayah": 1,
    "surahNameEnglish": "Yaseen",
    "surahNameArabic": "سُورَةُ يسٓ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ يسٓ",
    "englishText": "Ya, Seen."
  },
  {
    "surah": 54,
    "ayah": 1,
    "surahNameEnglish": "Al-Qamar",
    "surahNameArabic": "سُورَةُ القَمَرِ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْتَرَبَتِ ٱلسَّاعَةُ وَٱنشَقَّ ٱلْقَمَرُ",
    "englishText": "The Hour has come near, and the moon has split [in two]."
  },
  {
    "surah": 55,
    "ayah": 13,
    "surahNameEnglish": "Ar-Rahmaan",
    "surahNameArabic": "سُورَةُ الرَّحۡمَٰن",
    "arabicText": "فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ",
    "englishText": "So which of the favors of your Lord would you deny?"
  },
  {
    "surah": 93,
    "ayah": 1,
    "surahNameEnglish": "Ad-Dhuhaa",
    "surahNameArabic": "سُورَةُ الضُّحَىٰ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ وَٱلضُّحَىٰ",
    "englishText": "By the morning brightness"
  },
  {
    "surah": 93,
    "ayah": 6,
    "surahNameEnglish": "Ad-Dhuhaa",
    "surahNameArabic": "سُورَةُ الضُّحَىٰ",
    "arabicText": "أَلَمْ يَجِدْكَ يَتِيمًۭا فَـَٔاوَىٰ",
    "englishText": "Did He not find you an orphan and give [you] refuge?"
  },
  {
    "surah": 94,
    "ayah": 5,
    "surahNameEnglish": "Ash-Sharh",
    "surahNameArabic": "سُورَةُ الشَّرۡحِ",
    "arabicText": "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا",
    "englishText": "For indeed, with hardship [will be] ease."
  },
  {
    "surah": 94,
    "ayah": 6,
    "surahNameEnglish": "Ash-Sharh",
    "surahNameArabic": "سُورَةُ الشَّرۡحِ",
    "arabicText": "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًۭا",
    "englishText": "Indeed, with hardship [will be] ease."
  },
  {
    "surah": 103,
    "ayah": 1,
    "surahNameEnglish": "Al-Asr",
    "surahNameArabic": "سُورَةُ العَصۡرِ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ وَٱلْعَصْرِ",
    "englishText": "By time,"
  },
  {
    "surah": 103,
    "ayah": 2,
    "surahNameEnglish": "Al-Asr",
    "surahNameArabic": "سُورَةُ العَصۡرِ",
    "arabicText": "إِنَّ ٱلْإِنسَٰنَ لَفِى خُسْرٍ",
    "englishText": "Indeed, mankind is in loss,"
  },
  {
    "surah": 110,
    "ayah": 1,
    "surahNameEnglish": "An-Nasr",
    "surahNameArabic": "سُورَةُ النَّصۡرِ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ إِذَا جَآءَ نَصْرُ ٱللَّهِ وَٱلْفَتْحُ",
    "englishText": "When the victory of Allah has come and the conquest,"
  },
  {
    "surah": 112,
    "ayah": 1,
    "surahNameEnglish": "Al-Ikhlaas",
    "surahNameArabic": "سُورَةُ الإِخۡلَاصِ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ",
    "englishText": "Say, \"He is Allah, [who is] One,"
  },
  {
    "surah": 112,
    "ayah": 2,
    "surahNameEnglish": "Al-Ikhlaas",
    "surahNameArabic": "سُورَةُ الإِخۡلَاصِ",
    "arabicText": "ٱللَّهُ ٱلصَّمَدُ",
    "englishText": "Allah, the Eternal Refuge."
  },
  {
    "surah": 114,
    "ayah": 1,
    "surahNameEnglish": "An-Naas",
    "surahNameArabic": "سُورَةُ النَّاسِ",
    "arabicText": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ",
    "englishText": "Say, \"I seek refuge in the Lord of mankind,"
  }
]
;
