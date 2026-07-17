/**
 * Conservative word-like detector for auto mode.
 * Prefer lookup for short single-token queries; otherwise translate.
 */
export function isLookupCandidate(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // code-point length limit (not UTF-16 length)
  const cps = [...t]
  if (cps.length > 32) return false
  if (/\s/.test(t)) return false
  // allow letters/marks/numbers across scripts, plus hyphen/apostrophe
  return /^[\p{L}\p{M}\p{N}'’\-·・]+$/u.test(t)
}
