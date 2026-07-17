export const YOUDAO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function youdaoHeaders(cookie?: string): HeadersInit {
  const h: Record<string, string> = {
    "User-Agent": YOUDAO_UA,
    Referer: "https://fanyi.youdao.com/",
    Origin: "https://fanyi.youdao.com",
  }
  if (cookie) h.Cookie = cookie
  return h
}
