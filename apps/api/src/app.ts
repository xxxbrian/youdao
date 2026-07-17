import { Hono } from "hono"
import { cors } from "hono/cors"
import type { AppEnv } from "./env"
import { toErrorBody } from "./lib/errors"
import { authMiddleware } from "./middleware/auth"
import { v1 } from "./routes/v1"

const app = new Hono<AppEnv>()

app.use("*", cors())
app.use("*", async (c, next) => {
  await next()
  c.header("Cache-Control", "no-store")
})

app.get("/", (c) =>
  c.json({
    ok: true,
    name: "youdao",
    version: "0.1.0",
    endpoints: ["/health", "/v1/translate", "/v1/lookup", "/v1/query"],
  }),
)

app.get("/health", (c) => c.json({ ok: true, status: "up" }))

app.use("/v1/*", authMiddleware)
app.route("/v1", v1)

app.onError((err, c) => {
  const body = toErrorBody(err)
  // Avoid logging secrets / full query text in production paths.
  if (body.error.code === "INTERNAL_ERROR") {
    console.error("[youdao]", err instanceof Error ? err.message : err)
  }
  return c.json({ ok: false, error: body.error }, body.status as 400 | 401 | 413 | 500 | 502 | 504)
})

app.notFound((c) =>
  c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Not found" } }, 404),
)

export default app
