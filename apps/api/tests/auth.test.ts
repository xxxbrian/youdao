import { describe, expect, test } from "bun:test"
import app from "../src/app"

describe("auth middleware", () => {
  test("open when API_KEY is unset", async () => {
    const res = await app.fetch(
      new Request("http://x/v1/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      }),
      {},
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  }, 20_000)

  test("require matching bearer when API_KEY set", async () => {
    const bad = await app.fetch(
      new Request("http://x/v1/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hi" }),
      }),
      { API_KEY: "secret" },
    )
    expect(bad.status).toBe(401)

    const good = await app.fetch(
      new Request("http://x/v1/translate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret",
        },
        body: JSON.stringify({ text: "hello" }),
      }),
      { API_KEY: "secret" },
    )
    expect(good.status).toBe(200)
    const json = (await good.json()) as { ok: boolean; translation?: string }
    expect(json.ok).toBe(true)
    expect(json.translation).toBeTruthy()
  }, 20_000)
})
