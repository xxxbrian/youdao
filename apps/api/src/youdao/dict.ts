import { AppError } from "../lib/errors"
import { md5Hex } from "./crypto"
import { youdaoHeaders } from "./headers"
import { resolveCookie, rotateCookie } from "./session"
import type {
  DictExample,
  DictExtra,
  Explanation,
  LookupDirection,
  LookupResult,
  Phonetic,
  RelatedWord,
  Suggestion,
  WebTranslation,
  WordForm,
} from "./types"

const DICT_URL = "https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4"
const DICT_CLIENT = "web"
const DICT_KEYFROM = "webdict"
const DICT_SECRET = "Mk6hqtUp33DGGtoS63tTJbMUYjRrG1Lu"
const FETCH_TIMEOUT_MS = 12_000
const VOICE_BASE = "https://dict.youdao.com/dictvoice"

export async function lookupWord(options: { q: string; cookie?: string }): Promise<LookupResult> {
  const q = options.q.trim()
  if (!q) throw new AppError("BAD_REQUEST", "q is required")
  let cookie = resolveCookie(options.cookie)

  try {
    return await lookupOnce(q, cookie)
  } catch (err) {
    if (err instanceof AppError && err.code === "UPSTREAM_PROTOCOL_ERROR") {
      if (!options.cookie) cookie = rotateCookie()
      return await lookupOnce(q, cookie)
    }
    throw err
  }
}

/** Parse a raw Youdao jsonapi_s payload (exported for fixture tests). */
export function parseDictPayload(query: string, raw: unknown): LookupResult {
  // Non-object payloads are protocol failures (not clean misses).
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao dict returned non-object payload")
  }

  const data = raw as Record<string, unknown>
  assertNotUpstreamErrorEnvelope(data)

  const ecPhonetics: Phonetic[] = []
  const ecExplanations: Explanation[] = []
  const forms: WordForm[] = []
  const tags: string[] = []
  const webTranslations: WebTranslation[] = []
  const suggestions: Suggestion[] = []
  const relatedWords: RelatedWord[] = []
  const newhhExplanations: Explanation[] = []
  const examples: DictExample[] = []
  const extras: DictExtra[] = []

  parseEc(data, query, {
    phonetics: ecPhonetics,
    explanations: ecExplanations,
    forms,
    tags,
  })
  parseCe(data, query, { relatedWords })
  parseNewhh(data, { explanations: newhhExplanations })
  parseWebTrans(data, query, webTranslations)
  parseBlng(data, examples)
  parseBaike(data, extras)
  parseTypos(data, suggestions)

  // Direction from section-specific lexical content only.
  let direction: LookupDirection = "unknown"
  if (ecExplanations.length > 0) {
    direction = "en2zh"
  } else if (relatedWords.length > 0 || newhhExplanations.length > 0) {
    direction = "zh2en"
  }

  const phonetics: Phonetic[] = []
  let explanations: Explanation[] = []

  if (direction === "en2zh") {
    phonetics.push(...ecPhonetics)
    explanations = ecExplanations
  } else if (direction === "zh2en") {
    explanations = newhhExplanations
    const pinyin = extractPinyin(data)
    if (pinyin) {
      phonetics.push({
        accent: "pinyin",
        text: pinyin,
        audioUrl: voiceUrl(query, 2),
      })
    }
  }

  const found =
    (direction === "en2zh" && explanations.length > 0) ||
    (direction === "zh2en" && (relatedWords.length > 0 || explanations.length > 0))

  return {
    query,
    found,
    direction,
    phonetics,
    explanations,
    forms: direction === "en2zh" ? forms : [],
    tags: direction === "en2zh" ? tags : [],
    webTranslations,
    suggestions,
    relatedWords: direction === "zh2en" ? relatedWords : [],
    examples,
    extras,
  }
}

async function lookupOnce(q: string, cookie: string): Promise<LookupResult> {
  const time = `${q}${DICT_KEYFROM}`.length % 10
  const r = `${q}${DICT_KEYFROM}`
  const o = md5Hex(r)
  const n = `${DICT_CLIENT}${q}${time}${DICT_SECRET}${o}`
  const sign = md5Hex(n)

  const body = new URLSearchParams({
    q,
    keyfrom: DICT_KEYFROM,
    sign,
    client: DICT_CLIENT,
    t: String(time),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(DICT_URL, {
      method: "POST",
      headers: {
        ...youdaoHeaders(cookie),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new AppError("UPSTREAM_ERROR", `Youdao dict HTTP ${res.status}`)
    }
    const json: unknown = await res.json()
    return parseDictPayload(q, json)
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError("UPSTREAM_TIMEOUT", "Youdao dict timeout")
    }
    throw new AppError("UPSTREAM_ERROR", err instanceof Error ? err.message : "Youdao dict failed")
  } finally {
    clearTimeout(timer)
  }
}

function parseEc(
  data: Record<string, unknown>,
  query: string,
  out: {
    phonetics: Phonetic[]
    explanations: Explanation[]
    forms: WordForm[]
    tags: string[]
  },
): boolean {
  const ec = asRecord(data.ec)
  if (!ec) return false
  const wordRaw = ec.word
  const word = Array.isArray(wordRaw) ? asRecord(wordRaw[0]) : asRecord(wordRaw)
  if (!word) return false

  const usphone = asString(word.usphone)
  const ukphone = asString(word.ukphone)
  const usspeech = asString(word.usspeech)
  const ukspeech = asString(word.ukspeech)

  if (usphone || usspeech) {
    out.phonetics.push({
      accent: "us",
      text: usphone ?? "",
      audioUrl: voiceUrl(usspeech ?? query, 2),
    })
  }
  if (ukphone || ukspeech) {
    out.phonetics.push({
      accent: "uk",
      text: ukphone ?? "",
      audioUrl: voiceUrl(ukspeech ?? query, 1),
    })
  }

  for (const item of asArray(word.trs)) {
    const tr = asRecord(item)
    if (!tr) continue
    const pos = asString(tr.pos) ?? ""
    const tran = asString(tr.tran)
    if (!tran) continue
    out.explanations.push({
      partOfSpeech: pos,
      meanings: splitMeans(tran),
    })
  }

  for (const item of asArray(word.wfs)) {
    const wrap = asRecord(item)
    const wf = asRecord(wrap?.wf)
    if (!wf) continue
    const name = asString(wf.name)
    const value = asString(wf.value)
    if (name && value) out.forms.push({ name, values: [value] })
  }

  const prototype = asString(word.prototype)
  if (prototype) out.forms.push({ name: "原形", values: [prototype] })

  for (const t of asArray(ec.exam_type)) {
    const s = asString(t)
    if (s) out.tags.push(s)
  }

  return out.explanations.length > 0 || out.phonetics.length > 0
}

function parseCe(
  data: Record<string, unknown>,
  _query: string,
  out: { relatedWords: RelatedWord[] },
): boolean {
  const ce = asRecord(data.ce)
  const word = asRecord(ce?.word)
  if (!word) return false

  for (const item of asArray(word.trs)) {
    const tr = asRecord(item)
    if (!tr) continue
    const eng = asString(tr["#text"]) ?? asString(tr.text)
    if (!eng) continue
    const tran = asString(tr["#tran"]) ?? asString(tr.tran) ?? ""
    const voice = asString(tr.voice)
    const means = splitMeans(tran)
    const entry: RelatedWord = { word: eng, means }
    if (voice) entry.audioUrl = voiceUrl(voice, 2)
    else entry.audioUrl = voiceUrl(eng, 2)
    // dedupe by word
    if (!out.relatedWords.some((r) => r.word.toLowerCase() === eng.toLowerCase())) {
      out.relatedWords.push(entry)
    }
  }

  return out.relatedWords.length > 0
}

function parseNewhh(data: Record<string, unknown>, out: { explanations: Explanation[] }): boolean {
  const nh = asRecord(data.newhh)
  if (!nh) return false
  let added = false
  for (const item of asArray(nh.dataList)) {
    const rec = asRecord(item)
    if (!rec) continue
    const cat = asString(rec.cat) ?? ""
    for (const sense of asArray(rec.sense)) {
      const s = asRecord(sense)
      if (!s) continue
      const pos = asString(s.cat) ?? cat
      const defs = asArray(s.def)
        .map(asString)
        .filter((x): x is string => !!x)
      if (defs.length) {
        out.explanations.push({ partOfSpeech: pos, meanings: defs })
        added = true
      }
    }
  }
  return added
}

function extractPinyin(data: Record<string, unknown>): string | null {
  // ce.word.phone
  const ce = asRecord(data.ce)
  const ceWord = asRecord(ce?.word)
  const cePhone = asString(ceWord?.phone)
  if (cePhone) return cePhone

  // ce_new.word[].phone
  const ceNew = asRecord(data.ce_new)
  for (const w of asArray(ceNew?.word)) {
    const rec = asRecord(w)
    const phone = asString(rec?.phone)
    if (phone) return phone
  }

  // simple.word[].phone
  const simple = asRecord(data.simple)
  for (const w of asArray(simple?.word)) {
    const rec = asRecord(w)
    const phone = asString(rec?.phone)
    if (phone) return phone
  }

  // newhh.dataList[].pinyin
  const nh = asRecord(data.newhh)
  for (const item of asArray(nh?.dataList)) {
    const rec = asRecord(item)
    const pinyin = asString(rec?.pinyin)
    if (pinyin) return pinyin
  }

  return null
}

function parseWebTrans(data: Record<string, unknown>, query: string, out: WebTranslation[]): void {
  const web = asRecord(data.web_trans)
  const list = asArray(web?.["web-translation"])
  for (const item of list) {
    const rec = asRecord(item)
    if (!rec) continue
    const key = asString(rec.key) ?? query
    const meanings: string[] = []
    for (const t of asArray(rec.trans)) {
      const tr = asRecord(t)
      const value = asString(tr?.value)
      if (value) meanings.push(value)
    }
    if (meanings.length) out.push({ phrase: key, meanings: dedupe(meanings) })
  }
}

function parseBlng(data: Record<string, unknown>, out: DictExample[]): void {
  const blng = asRecord(data.blng_sents_part)
  const pairs = asArray(blng?.["sentence-pair"])
  for (const item of pairs.slice(0, 3)) {
    const rec = asRecord(item)
    if (!rec) continue
    const source = asString(rec.sentence)
    const target = asString(rec["sentence-translation"])
    if (source && target) out.push({ source, target })
  }
}

function parseBaike(data: Record<string, unknown>, out: DictExtra[]): void {
  const baike = asRecord(data.baike)
  const summarys = asArray(baike?.summarys)
  const first = asRecord(summarys[0])
  const summary = asString(first?.summary)
  if (summary) {
    // strip HTML-ish tags lightly
    const clean = summary.replace(/<[^>]+>/g, "").trim()
    if (clean) out.push({ name: "百科", value: clean })
  }
}

function parseTypos(data: Record<string, unknown>, out: Suggestion[]): void {
  const typos = asRecord(data.typos)
  for (const item of asArray(typos?.typo)) {
    const rec = asRecord(item)
    const text = asString(rec?.word)
    const translation = asString(rec?.trans)
    if (text) out.push({ text, translation: translation ?? undefined })
  }
}

function assertNotUpstreamErrorEnvelope(data: Record<string, unknown>): void {
  if ("code" in data && data.code !== 0 && data.code !== "0") {
    const msg = asString(data.msg) ?? asString(data.message) ?? String(data.code)
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", `Youdao dict error: ${msg}`)
  }
  const hasSection =
    "ec" in data ||
    "ce" in data ||
    "ce_new" in data ||
    "web_trans" in data ||
    "typos" in data ||
    "meta" in data ||
    "input" in data ||
    "newhh" in data ||
    "fanyi" in data
  if (!hasSection) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao dict payload missing expected sections")
  }
}

function splitMeans(tran: string): string[] {
  return dedupe(
    tran
      .split(/[；;]/)
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function voiceUrl(audio: string, type: 1 | 2): string {
  const token = audio.includes("&") ? (audio.split("&")[0] ?? audio) : audio
  return `${VOICE_BASE}?audio=${encodeURIComponent(token)}&type=${type}`
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null
}
