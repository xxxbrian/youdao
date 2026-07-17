/** Normalize common language tags to Youdao web codes. */
export function toYoudaoLang(input?: string): string {
  if (!input || input === "auto" || input === "Auto") return "auto"
  const map: Record<string, string> = {
    "zh-Hans": "zh-CHS",
    "zh-Hant": "zh-CHT",
    "zh-CN": "zh-CHS",
    "zh-TW": "zh-CHT",
    zh: "zh-CHS",
    en: "en",
    ja: "ja",
    ko: "ko",
    fr: "fr",
    de: "de",
    es: "es",
    ru: "ru",
    it: "it",
    pt: "pt",
    vi: "vi",
    th: "th",
    ar: "ar",
    id: "id",
    nl: "nl",
    pl: "pl",
  }
  return map[input] ?? input
}

export function isChineseLang(code?: string): boolean {
  if (!code || code === "auto") return false
  const c = code.toLowerCase()
  return (
    c === "zh" ||
    c === "zh-chs" ||
    c === "zh-cht" ||
    c === "zh-hans" ||
    c === "zh-hant" ||
    c === "zh-cn" ||
    c === "zh-tw" ||
    c.startsWith("zh-")
  )
}

export function isEnglishLang(code?: string): boolean {
  if (!code || code === "auto") return false
  const c = code.toLowerCase()
  return c === "en" || c === "eng" || c.startsWith("en-")
}

/**
 * Whether a dictionary hit should be used for auto mode given requested languages.
 * Explicit /lookup or mode=lookup bypasses this (caller decides).
 */
export function dictDirectionMatchesPair(
  direction: "en2zh" | "zh2en" | "unknown",
  from?: string,
  to?: string,
): boolean {
  if (direction === "unknown") return false

  const fromY = toYoudaoLang(from)
  const toY = toYoudaoLang(to)
  const fromAuto = !from || fromY === "auto"
  const toAuto = !to || toY === "auto"

  if (direction === "en2zh") {
    // Need Chinese target (or auto); reject if target is clearly non-Chinese
    if (!toAuto && !isChineseLang(toY)) return false
    // If source is explicit and not English/auto, reject
    if (!fromAuto && !isEnglishLang(fromY)) return false
    return true
  }

  // zh2en
  if (!toAuto && !isEnglishLang(toY)) return false
  if (!fromAuto && !isChineseLang(fromY)) return false
  return true
}
