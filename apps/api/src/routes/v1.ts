import { Hono } from "hono"
import type { AppEnv } from "../env"
import { readJsonObject } from "../lib/body"
import { AppError } from "../lib/errors"
import { dictDirectionMatchesPair } from "../lib/languages"
import { isLookupCandidate } from "../lib/query-mode"
import { lookupWord } from "../youdao/dict"
import { translateText } from "../youdao/translate"
import type { LookupResult, TranslateResult } from "../youdao/types"

const MAX_TEXT_CHARS = 20_000

export const v1 = new Hono<AppEnv>()

v1.post("/translate", async (c) => {
  const body = await readJsonObject(c.req.raw)
  const text = asString(body.text)
  if (!text) throw new AppError("BAD_REQUEST", "text is required")
  assertTextSize(text, "text")

  const result = await translateText({
    text,
    from: asString(body.from) ?? undefined,
    to: asString(body.to) ?? undefined,
    cookie: c.env?.YOUDAO_COOKIE,
  })

  return c.json(translateResponse(result))
})

v1.post("/lookup", async (c) => {
  const body = await readJsonObject(c.req.raw)
  const q = asString(body.q) ?? asString(body.text)
  if (!q) throw new AppError("BAD_REQUEST", "q is required")
  assertTextSize(q, "q")

  const lookup = await lookupWord({ q, cookie: c.env?.YOUDAO_COOKIE })
  return c.json(lookupResponse(lookup))
})

v1.post("/query", async (c) => {
  const body = await readJsonObject(c.req.raw)
  const text = asString(body.text)
  if (!text) throw new AppError("BAD_REQUEST", "text is required")
  assertTextSize(text, "text")

  const modeRaw = (asString(body.mode) ?? "auto").toLowerCase()
  if (!["auto", "translate", "lookup"].includes(modeRaw)) {
    throw new AppError("BAD_REQUEST", "mode must be auto|translate|lookup")
  }

  const from = asString(body.from) ?? undefined
  const to = asString(body.to) ?? undefined
  const cookie = c.env?.YOUDAO_COOKIE

  if (modeRaw === "translate") {
    const result = await translateText({ text, from, to, cookie })
    return c.json(translateResponse(result))
  }

  if (modeRaw === "lookup") {
    // Explicit lookup: return dict regardless of language pair
    const lookup = await lookupWord({ q: text, cookie })
    return c.json(lookupResponse(lookup))
  }

  // auto: only use dict when candidate + found + direction matches requested pair
  if (isLookupCandidate(text)) {
    const lookup = await lookupWord({ q: text, cookie })
    if (lookup.found && dictDirectionMatchesPair(lookup.direction, from, to)) {
      return c.json(lookupResponse(lookup))
    }
  }

  const result = await translateText({ text, from, to, cookie })
  return c.json(translateResponse(result))
})

function translateResponse(result: TranslateResult) {
  return {
    ok: true as const,
    mode: "translate" as const,
    ...result,
  }
}

export function lookupResponse(lookup: LookupResult) {
  const paragraphs = buildLookupParagraphs(lookup)
  return {
    ok: true as const,
    mode: "lookup" as const,
    text: lookup.query,
    translation: paragraphs.join("\n"),
    paragraphs,
    lookup,
  }
}

export function buildLookupParagraphs(lookup: LookupResult): string[] {
  const paragraphs: string[] = []

  if (lookup.direction === "zh2en" && lookup.relatedWords.length > 0) {
    // Bob official Chinese example: first related word only as primary translation.
    // Full candidates live in toDict.relatedWordParts — do not dump them here.
    const firstRelated = lookup.relatedWords[0]
    if (firstRelated?.word) paragraphs.push(firstRelated.word)
  } else if (lookup.found && lookup.explanations.length > 0) {
    // Bob shows toDict.parts with POS styling; toParagraphs is only a short
    // primary translation (official "good" example uses ["好"], not full parts).
    // Avoid re-printing "n. …" which duplicates the dictionary section.
    const first = lookup.explanations[0]
    const means = first?.meanings?.filter(Boolean) ?? []
    if (means.length) {
      paragraphs.push(means.join("；"))
    }
  } else if (lookup.found && lookup.relatedWords[0]?.word) {
    paragraphs.push(lookup.relatedWords[0].word)
  } else if (lookup.suggestions.length) {
    paragraphs.push(
      `未找到“${lookup.query}”。您要找的是不是：${lookup.suggestions.map((s) => s.text).join("、")}`,
    )
  } else {
    paragraphs.push(`未找到“${lookup.query}”相关释义`)
  }

  if (paragraphs.length === 0) paragraphs.push(lookup.query)
  return paragraphs
}

function assertTextSize(text: string, field: string): void {
  if ([...text].length > MAX_TEXT_CHARS) {
    throw new AppError("PAYLOAD_TOO_LARGE", `${field} too large`)
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v.trim() || null : null
}
