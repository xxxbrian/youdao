/**
 * Source-coverage check for Youdao /webtranslate responses.
 *
 * Youdao re-segments the request text and rebuilds `translateResult[].src`
 * from its own sentence split, so whitespace at segment boundaries does not
 * survive the round trip. Example (real log):
 *
 *   input:    "…customizable.The services enabled…"
 *   upstream: "…customizable. The services enabled…"
 *
 * Such differences are formatting only. A stale signing key / anti-bot cache
 * hit instead returns a payload whose *characters* differ (unrelated text,
 * reordered sentences, dropped tail), so we compare a whitespace-insensitive
 * form: identical characters in identical order is required.
 */

/** Zero-width / BOM characters that `\s` does not cover. */
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g

/** Canonical form: NFC, no zero-width chars, collapsed spaces, trimmed. */
export function normalizeSrc(s: string): string {
  return s
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n+/g, "\n")
    .trim()
}

/** Characters only: ignores all layout/whitespace differences. */
export function squashSrc(s: string): string {
  return normalizeSrc(s).replace(/\s+/g, "")
}

/**
 * True when upstream `src` covers `input`.
 *
 * 1. exact match after normalization, or
 * 2. characters match once whitespace is removed (segment-boundary spacing).
 */
export function sourcesMatch(input: string, upstream: string): boolean {
  if (normalizeSrc(input) === normalizeSrc(upstream)) return true
  const a = squashSrc(input)
  const b = squashSrc(upstream)
  return a.length > 0 && a === b
}

export type SourceMismatch = {
  /** Index of the first differing character after squashing. -1 if one is a prefix. */
  index: number
  inputLength: number
  upstreamLength: number
  /** True when upstream is shorter: likely truncation rather than a bad signature. */
  truncated: boolean
}

/**
 * Content-free diagnostic (lengths + offset only) so failures can be logged
 * without leaking user text.
 */
export function describeSourceMismatch(input: string, upstream: string): SourceMismatch {
  const a = squashSrc(input)
  const b = squashSrc(upstream)
  const max = Math.max(a.length, b.length)
  let index = -1
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      index = i
      break
    }
  }
  return {
    index,
    inputLength: a.length,
    upstreamLength: b.length,
    truncated: b.length < a.length,
  }
}
