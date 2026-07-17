/**
 * Anonymous browser-like cookie jar for Youdao web endpoints.
 * Live checks show short words often work cookie-free, but sentences
 * with punctuation frequently return code 50 without cookies.
 */

let jar: string | null = null

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function buildAnonymousCookie(): string {
  const ncoo = `${randInt(100_000_000, 999_999_999)}.${randInt(100_000_000, 999_999_999)}`
  const uid = `-${randInt(100_000_000, 999_999_999)}@${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(0, 255)}`
  return `OUTFOX_SEARCH_USER_ID_NCOO=${ncoo}; OUTFOX_SEARCH_USER_ID=${uid}`
}

/** Prefer explicit override, else stable per-isolate anonymous jar. */
export function resolveCookie(override?: string): string {
  if (override?.trim()) return override.trim()
  if (!jar) jar = buildAnonymousCookie()
  return jar
}

/** Rotate jar after protocol failures that look like anti-bot / session issues. */
export function rotateCookie(): string {
  jar = buildAnonymousCookie()
  return jar
}
