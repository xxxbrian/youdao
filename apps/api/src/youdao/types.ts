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

export type Phonetic = {
  accent: "us" | "uk" | string
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

export type LookupResult = {
  query: string
  found: boolean
  phonetics: Phonetic[]
  explanations: Explanation[]
  forms: WordForm[]
  tags: string[]
  webTranslations: WebTranslation[]
  suggestions: Suggestion[]
}
