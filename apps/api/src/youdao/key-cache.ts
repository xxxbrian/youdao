import { AppError } from "../lib/errors"
import { md5Hex } from "./crypto"
import { youdaoHeaders } from "./headers"
import type { YoudaoKeyBundle } from "./types"

/** Bootstrap key used only for /webtranslate/key (not for translation). */
const KEY_BOOTSTRAP = "asdjnjfenknafdfsdfsd"
const KEY_ID = "webfanyi-key-getter"
const KEY_URL = "https://dict.youdao.com/webtranslate/key"
const KEY_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

let cached: YoudaoKeyBundle | null = null
let inflight: Promise<YoudaoKeyBundle> | null = null

function sign(mysticTime: string, key: string): string {
  return md5Hex(`client=fanyideskweb&mysticTime=${mysticTime}&product=webfanyi&key=${key}`)
}

export function invalidateKeyCache(): void {
  cached = null
}

export async function getKeyBundle(cookie?: string): Promise<YoudaoKeyBundle> {
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) {
    return cached
  }
  if (inflight) return inflight

  inflight = fetchKeyBundle(cookie)
    .then((bundle) => {
      cached = bundle
      return bundle
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

async function fetchKeyBundle(cookie?: string): Promise<YoudaoKeyBundle> {
  const mysticTime = Date.now().toString()
  const params = new URLSearchParams({
    keyid: KEY_ID,
    sign: sign(mysticTime, KEY_BOOTSTRAP),
    client: "fanyideskweb",
    product: "webfanyi",
    appVersion: "1.0.0",
    vendor: "web",
    pointParam: "client,mysticTime,product",
    mysticTime,
    keyfrom: "fanyi.web",
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${KEY_URL}?${params}`, {
      method: "GET",
      headers: youdaoHeaders(cookie),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new AppError("UPSTREAM_ERROR", `Youdao key endpoint HTTP ${res.status}`)
    }
    const json = (await res.json()) as {
      code?: number
      msg?: string
      data?: { secretKey?: string; aesKey?: string; aesIv?: string }
    }
    if (json.code !== 0 || !json.data?.secretKey || !json.data?.aesKey || !json.data?.aesIv) {
      throw new AppError(
        "UPSTREAM_PROTOCOL_ERROR",
        `Youdao key endpoint invalid response: ${json.msg ?? "unknown"}`,
      )
    }
    return {
      secretKey: json.data.secretKey,
      aesKey: json.data.aesKey,
      aesIv: json.data.aesIv,
      fetchedAt: Date.now(),
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError("UPSTREAM_TIMEOUT", "Youdao key endpoint timeout")
    }
    throw new AppError(
      "UPSTREAM_ERROR",
      err instanceof Error ? err.message : "Youdao key fetch failed",
    )
  } finally {
    clearTimeout(timer)
  }
}

export function buildSignedParams(
  secretKey: string,
  mysticTime = Date.now().toString(),
): Record<string, string> {
  return {
    sign: sign(mysticTime, secretKey),
    client: "fanyideskweb",
    product: "webfanyi",
    appVersion: "1.0.0",
    vendor: "web",
    pointParam: "client,mysticTime,product",
    mysticTime,
    keyfrom: "fanyi.web",
  }
}
