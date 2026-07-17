export type YoudaoKeyBundle = {
  secretKey: string
  aesKey: string
  aesIv: string
  fetchedAt: number
}

export type TranslateResult = {
  from: string
  to: string
  text: string
  translation: string
  paragraphs: string[]
}

export type PhoneticAccent = "us" | "uk" | "pinyin"

export type Phonetic = {
  accent: PhoneticAccent
  text: string
  audioUrl: string
}

export type Explanation = {
  partOfSpeech: string
  meanings: string[]
}

export type WordForm = {
  name: string
  values: string[]
}

export type WebTranslation = {
  phrase: string
  meanings: string[]
}

export type Suggestion = {
  text: string
  translation?: string
}

export type RelatedWord = {
  word: string
  means: string[]
  audioUrl?: string
}

export type DictExample = {
  source: string
  target: string
}

export type DictExtra = {
  name: string
  value: string
}

export type LookupDirection = "en2zh" | "zh2en" | "unknown"

export type LookupResult = {
  query: string
  found: boolean
  direction: LookupDirection
  phonetics: Phonetic[]
  explanations: Explanation[]
  forms: WordForm[]
  tags: string[]
  webTranslations: WebTranslation[]
  suggestions: Suggestion[]
  relatedWords: RelatedWord[]
  examples: DictExample[]
  extras: DictExtra[]
}
