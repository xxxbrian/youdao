import { AppError } from "./errors"

const DEFAULT_MAX_BYTES = 64 * 1024

/**
 * Read request body with a hard byte limit before JSON parsing.
 * Avoids buffering unbounded chunked payloads.
 */
export async function readJsonObject(
  req: Request,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<Record<string, unknown>> {
  const cl = req.headers.get("content-length")
  if (cl) {
    const n = Number(cl)
    if (Number.isFinite(n) && n > maxBytes) {
      throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large")
    }
  }

  const reader = req.body?.getReader()
  if (!reader) {
    throw new AppError("BAD_REQUEST", "Empty body")
  }

  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        // ignore
      }
      throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large")
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }

  let text: string
  try {
    text = new TextDecoder().decode(bytes)
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid body encoding")
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid JSON body")
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("BAD_REQUEST", "JSON object required")
  }
  return raw as Record<string, unknown>
}
