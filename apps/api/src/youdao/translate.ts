import { AppError } from "../lib/errors"
import { toYoudaoLang } from "../lib/languages"
import { aes128CbcDecrypt } from "./crypto"
import { youdaoHeaders } from "./headers"
import { buildSignedParams, getKeyBundle, invalidateKeyCache } from "./key-cache"
import { resolveCookie, rotateCookie } from "./session"
import type { TranslateResult, YoudaoKeyBundle } from "./types"

const TRANSLATE_URL = "https://dict.youdao.com/webtranslate"
const FETCH_TIMEOUT_MS = 15_000
const MAX_TEXT_CHARS = 5000

type WireTranslate = {
  code?: number
  msg?: string
  type?: string
  translateResult?: Array<Array<{ src?: string; tgt?: string }>>
}

export async function translateText(options: {
  text: string
  from?: string
  to?: string
  cookie?: string
}): Promise<TranslateResult> {
  const text = options.text.trim()
  if (!text) throw new AppError("BAD_REQUEST", "text is required")
  if ([...text].length > MAX_TEXT_CHARS) {
    throw new AppError("PAYLOAD_TOO_LARGE", `text exceeds ${MAX_TEXT_CHARS} characters`)
  }

  const from = toYoudaoLang(options.from)
  const to = toYoudaoLang(options.to)
  let cookie = resolveCookie(options.cookie)

  try {
    return await translateOnce(text, from, to, cookie)
  } catch (err) {
    // Protocol failures: rotate anonymous session + refresh key, retry once.
    if (err instanceof AppError && err.code === "UPSTREAM_PROTOCOL_ERROR") {
      if (!options.cookie) cookie = rotateCookie()
      invalidateKeyCache()
      return await translateOnce(text, from, to, cookie)
    }
    throw err
  }
}

async function translateOnce(
  text: string,
  from: string,
  to: string,
  cookie: string,
): Promise<TranslateResult> {
  const keys = await getKeyBundle(cookie)
  const body = await postWebTranslate(text, from, to, keys, cookie)
  const plain = await decryptPayload(body, keys)
  return parseTranslatePayload(plain, text, from, to)
}

async function postWebTranslate(
  text: string,
  from: string,
  to: string,
  keys: YoudaoKeyBundle,
  cookie: string,
): Promise<string> {
  const signed = buildSignedParams(keys.secretKey)
  const form = new URLSearchParams({
    i: text,
    from,
    to,
    domain: "0",
    dictResult: "true",
    keyid: "webfanyi",
    ...signed,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(TRANSLATE_URL, {
      method: "POST",
      headers: {
        ...youdaoHeaders(cookie),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new AppError("UPSTREAM_ERROR", `Youdao translate HTTP ${res.status}`)
    }
    return await res.text()
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError("UPSTREAM_TIMEOUT", "Youdao translate timeout")
    }
    throw new AppError(
      "UPSTREAM_ERROR",
      err instanceof Error ? err.message : "Youdao translate failed",
    )
  } finally {
    clearTimeout(timer)
  }
}

async function decryptPayload(body: string, keys: YoudaoKeyBundle): Promise<WireTranslate> {
  // Sometimes upstream returns plain JSON error instead of ciphertext.
  const trimmed = body.trim()
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as WireTranslate
      if (json.code !== 0) {
        throw new AppError(
          "UPSTREAM_PROTOCOL_ERROR",
          `Youdao translate error: ${json.msg ?? json.code}`,
        )
      }
      return json
    } catch (err) {
      if (err instanceof AppError) throw err
    }
  }

  let plain: string
  try {
    plain = await aes128CbcDecrypt(trimmed, keys.aesKey, keys.aesIv)
  } catch {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Failed to decrypt Youdao response")
  }

  try {
    return JSON.parse(plain) as WireTranslate
  } catch {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Decrypted Youdao payload is not JSON")
  }
}

function parseTranslatePayload(
  data: WireTranslate,
  originalText: string,
  from: string,
  to: string,
): TranslateResult {
  // Require explicit success code. code 50 is a common anti-bot / session signal.
  if (data.code !== 0) {
    throw new AppError(
      "UPSTREAM_PROTOCOL_ERROR",
      `Youdao translate code ${String(data.code)}: ${data.msg ?? ""}`.trim(),
    )
  }
  const rows = data.translateResult
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao translate missing translateResult")
  }

  const paragraphs: string[] = []
  const srcParts: string[] = []
  let cellCount = 0
  let srcCellCount = 0
  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue
    let tgt = ""
    let src = ""
    for (const cell of row) {
      cellCount++
      if (cell?.tgt) tgt += cell.tgt
      if (typeof cell?.src === "string") {
        src += cell.src
        srcCellCount++
      }
    }
    if (src) srcParts.push(src)
    // Youdao often returns blank-line rows as "\n" and content rows ending with "\n".
    // Keep only non-empty text segments; strip trailing newlines so join is predictable.
    const cleaned = normalizeParagraph(tgt)
    if (cleaned) paragraphs.push(cleaned)
  }

  if (paragraphs.length === 0) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao translate returned empty translation")
  }

  // Require source coverage to catch invalid-signature "plausible" payloads.
  if (cellCount === 0 || srcCellCount === 0) {
    throw new AppError("UPSTREAM_PROTOCOL_ERROR", "Youdao translate missing src fields")
  }

  const reconstructed = srcParts.join("")
  if (!sourcesMatch(originalText, reconstructed)) {
    throw new AppError(
      "UPSTREAM_PROTOCOL_ERROR",
      "Youdao translate source mismatch (possible invalid signature)",
    )
  }

  // type like "en2zh-CHS"
  let detectedFrom = from
  let detectedTo = to
  if (typeof data.type === "string" && data.type.includes("2")) {
    const [f, t] = data.type.split("2")
    if (f) detectedFrom = f
    if (t) detectedTo = t
  }

  // One blank line between paragraphs (matches typical letter/email spacing).
  const translation = paragraphs.join("\n\n")

  return {
    from: detectedFrom,
    to: detectedTo,
    text: originalText,
    translation,
    paragraphs,
  }
}

/** Drop blank-line-only segments; strip trailing newlines Youdao embeds in tgt. */
function normalizeParagraph(tgt: string): string {
  return tgt.replace(/\r\n/g, "\n").replace(/\n+$/g, "").trimEnd()
}

function sourcesMatch(input: string, upstream: string): boolean {
  const a = normalizeSrc(input)
  const b = normalizeSrc(upstream)
  return a === b
}

function normalizeSrc(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim()
}
