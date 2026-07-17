import type { MiddlewareHandler } from "hono"
import type { AppEnv } from "../env"
import { AppError } from "../lib/errors"

/**
 * Unified auth for Bun + Cloudflare:
 * - API_KEY set → require Bearer / X-API-Key
 * - API_KEY unset → open access
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const apiKey = c.env?.API_KEY
  if (!apiKey) {
    await next()
    return
  }

  const header = c.req.header("authorization") ?? ""
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""
  const xKey = c.req.header("x-api-key")?.trim() ?? ""
  const provided = bearer || xKey

  if (!provided || provided !== apiKey) {
    throw new AppError("UNAUTHORIZED", "Invalid or missing API key")
  }

  await next()
}
