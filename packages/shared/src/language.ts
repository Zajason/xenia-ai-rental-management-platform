/**
 * Supported concierge languages (FEATURE: multi-language concierge).
 * The AI detects the guest's language, replies in it, and falls back to English.
 */
export const SUPPORTED_LANGUAGES = [
  'en',
  'el',
  'fr',
  'de',
  'it',
  'es',
  'pt',
  'nl',
] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isSupportedLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(value: string | null | undefined): Language {
  if (!value) return DEFAULT_LANGUAGE;
  const base = value.slice(0, 2).toLowerCase();
  return isSupportedLanguage(base) ? base : DEFAULT_LANGUAGE;
}
