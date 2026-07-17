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
