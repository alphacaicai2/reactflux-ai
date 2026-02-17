/**
 * Supported Languages for AI Translation/Summarization
 */

export const AI_LANGUAGES = [
  { id: "zh-CN", name: "简体中文" },
  { id: "zh-TW", name: "繁體中文" },
  { id: "en", name: "English" },
  { id: "ja", name: "日本語" },
  { id: "ko", name: "한국어" },
  { id: "fr", name: "Français" },
  { id: "de", name: "Deutsch" },
  { id: "es", name: "Español" },
  { id: "pt", name: "Português" },
  { id: "ru", name: "Русский" },
  { id: "ar", name: "العربية" },
  { id: "th", name: "ไทย" },
  { id: "vi", name: "Tiếng Việt" },
]

/**
 * Get language by ID
 * @param {string} languageId - The language ID (e.g., 'zh-CN')
 * @returns {object|undefined} The language configuration
 */
export const getLanguageById = (languageId) => {
  return AI_LANGUAGES.find((lang) => lang.id === languageId)
}

/**
 * Get language name by ID
 * @param {string} languageId - The language ID
 * @returns {string} The language name or the ID if not found
 */
export const getLanguageName = (languageId) => {
  const language = getLanguageById(languageId)
  return language?.name ?? languageId
}

/**
 * Default target language for translations
 */
export const DEFAULT_TARGET_LANGUAGE = "zh-CN"
