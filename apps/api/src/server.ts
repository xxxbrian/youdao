import app from "./app"
import type { AppEnv } from "./env"

const port = Number(process.env.PORT ?? 8787)
const env = process.env as unknown as AppEnv["Bindings"]

console.log(`youdao listening on http://127.0.0.1:${port}`)
console.log(env.API_KEY ? "auth: API_KEY required" : "auth: open (no API_KEY)")

Bun.serve({
  port,
  fetch(request) {
    return app.fetch(request, env)
  },
})
