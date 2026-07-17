import { AppError } from "../lib/errors"
import { md5Hex } from "./crypto"
import { youdaoHeaders } from "./headers"
import { resolveCookie, rotateCookie } from "./session"
import type {
  Explanation,
  LookupResult,
  Phonetic,
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
    assertNotUpstreamErrorEnvelope(json)
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

function parseDictPayload(query: string, raw: unknown): LookupResult {
  const data = asRecord(raw)
  const empty: LookupResult = {
    query,
    found: false,
    phonetics: [],
    explanations: [],
    forms: [],
    tags: [],
    webTranslations: [],
    suggestions: [],
  }

  if (!data) return empty

  const phonetics: Phonetic[] = []
  const explanations: Explanation[] = []
  const forms: WordForm[] = []
  const tags: string[] = []
  const webTranslations: WebTranslation[] = []
  const suggestions: Suggestion[] = []

  // English → Chinese (ec)
  parseEc(data, query, { phonetics, explanations, forms, tags, webTranslations })

  // Chinese → English (ce / ce_new)
  parseCe(data, query, { phonetics, explanations })

  // Top-level web translations
  parseWebTrans(data, query, webTranslations)

  // fuzzy suggestions
  const typos = asRecord(data.typos)
  const typoList = asArray(typos?.typo)
  for (const item of typoList) {
    const rec = asRecord(item)
    const text = asString(rec?.word)
    const translation = asString(rec?.trans)
    if (text) suggestions.push({ text, translation: translation ?? undefined })
  }

  // found requires useful lexical content, not phonetics alone
  const found = explanations.length > 0 || webTranslations.length > 0

  if (!found && suggestions.length === 0) {
    return empty
  }

  return {
    query,
    found,
    phonetics,
    explanations,
    forms,
    tags,
    webTranslations,
    suggestions,
  }
}

function assertNotUpstreamErrorEnvelope(raw: unknown): void {
  const data = asRecord(raw)
  if (!data) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao dict returned non-object payload")
  }
  // Some Youdao endpoints return {code, msg} on failure
  if ("code" in data && data.code !== 0 && data.code !== "0") {
    const msg = asString(data.msg) ?? asString(data.message) ?? String(data.code)
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", `Youdao dict error: ${msg}`)
  }
  // Empty object / no recognizable sections → protocol error (not a clean miss)
  const hasSection =
    "ec" in data ||
    "ce" in data ||
    "ce_new" in data ||
    "web_trans" in data ||
    "typos" in data ||
    "meta" in data ||
    "input" in data
  if (!hasSection) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao dict payload missing expected sections")
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
    webTranslations: WebTranslation[]
  },
): void {
  const ec = asRecord(data.ec)
  const word = asRecord(ec?.word)
  if (!word) return

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
    if (tran) out.explanations.push({ partOfSpeech: pos, meanings: [tran] })
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

  if (ec) {
    for (const t of asArray(ec.exam_type)) {
      const s = asString(t)
      if (s) out.tags.push(s)
    }
    for (const item of asArray(ec.web_trans)) {
      if (typeof item === "string") {
        out.webTranslations.push({ phrase: query, meanings: [item] })
      }
    }
  }
}

function parseCe(
  data: Record<string, unknown>,
  query: string,
  out: { phonetics: Phonetic[]; explanations: Explanation[] },
): void {
  // ce.word.trs: [{ "#text": "apple", "#tran": "苹果；", voice: "apple&type=2" }]
  const ce = asRecord(data.ce)
  const ceWord = asRecord(ce?.word)
  if (ceWord) {
    for (const item of asArray(ceWord.trs)) {
      const tr = asRecord(item)
      if (!tr) continue
      const text = asString(tr["#text"]) ?? asString(tr.text)
      const voice = asString(tr.voice)
      if (text) {
        out.explanations.push({ partOfSpeech: "", meanings: [text] })
      }
      if (voice || text) {
        out.phonetics.push({
          accent: "us",
          text: "",
          audioUrl: voiceUrl(voice ?? text ?? query, 2),
        })
      }
    }
  }

  // ce_new.word[0].phone / trs
  const ceNew = asRecord(data.ce_new)
  const words = asArray(ceNew?.word)
  for (const w of words) {
    const rec = asRecord(w)
    if (!rec) continue
    const phone = asString(rec.phone)
    if (phone && !out.phonetics.some((p) => p.text === phone)) {
      out.phonetics.push({
        accent: "pinyin",
        text: phone,
        audioUrl: voiceUrl(query, 2),
      })
    }
    // trs can be deeply nested; collect plain strings when present
    for (const trWrap of asArray(rec.trs)) {
      const meanings = collectStrings(trWrap).filter((s) => s && s !== query)
      if (meanings.length) {
        out.explanations.push({ partOfSpeech: "", meanings })
      }
    }
  }
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
    if (meanings.length) out.push({ phrase: key, meanings })
  }
}

function collectStrings(node: unknown, depth = 0): string[] {
  if (depth > 6) return []
  if (typeof node === "string") return [node]
  if (Array.isArray(node)) {
    return node.flatMap((x) => collectStrings(x, depth + 1))
  }
  const rec = asRecord(node)
  if (!rec) return []
  // prefer leaf "i" / "value" / "#text"
  const out: string[] = []
  for (const key of ["#text", "value", "i"]) {
    if (key in rec) out.push(...collectStrings(rec[key], depth + 1))
  }
  return out
}

function voiceUrl(audio: string, type: 1 | 2): string {
  // Some payloads embed "word&type=1" already; prefer explicit type param.
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
