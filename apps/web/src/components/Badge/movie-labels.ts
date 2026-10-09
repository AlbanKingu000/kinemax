// Movie attributes shown as badges. The values match the API/database enums.

export type AgeRating = 'ALL' | 'AGE_7' | 'AGE_12' | 'AGE_15' | 'AGE_18';
export type MovieFormat = '2D' | '3D';
export type LanguageVersion = 'ORIGINAL_SQ_SUBTITLES' | 'DUBBED_SQ' | 'ORIGINAL_NO_SUBTITLES';

/** The short rating symbols (the same in every language). */
export const AGE_RATING_CODES: Record<AgeRating, string> = {
  ALL: 'ALL',
  AGE_7: '7+',
  AGE_12: '12+',
  AGE_15: '15+',
  AGE_18: '18+',
};

export const AGE_RATINGS = Object.keys(AGE_RATING_CODES) as AgeRating[];
export const LANGUAGE_VERSIONS: LanguageVersion[] = [
  'ORIGINAL_SQ_SUBTITLES',
  'DUBBED_SQ',
  'ORIGINAL_NO_SUBTITLES',
];
