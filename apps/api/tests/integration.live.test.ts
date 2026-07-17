/**
 * Live integration tests against real Youdao endpoints.
 * Skipped when RUN_LIVE=0.
 */
import { describe, expect, test } from "bun:test"
import app from "../src/app"
import type { AppEnv } from "../src/env"

// Opt-in: RUN_LIVE=1 bun test
const runLive = process.env.RUN_LIVE === "1"
const env: AppEnv["Bindings"] = {}

async function post(path: string, body: unknown) {
  const res = await app.fetch(
    new Request(`http://local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  )
  const json = (await res.json()) as Record<string, unknown>
  return { status: res.status, json }
}

describe.skipIf(!runLive)("live: word lookup + pronunciation", () => {
  test("english word apple has explanations, tags, us/uk audio urls", async () => {
    const { status, json } = await post("/v1/lookup", { q: "apple" })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.mode).toBe("lookup")

    const lookup = json.lookup as {
      found: boolean
      explanations: Array<{ meanings: string[] }>
      phonetics: Array<{ accent: string; text: string; audioUrl: string }>
      tags: string[]
    }
    expect(lookup.found).toBe(true)
    expect(lookup.explanations.length).toBeGreaterThan(0)
    expect(lookup.explanations.some((e) => e.meanings.join("").includes("苹果"))).toBe(true)

    const us = lookup.phonetics.find((p) => p.accent === "us")
    const uk = lookup.phonetics.find((p) => p.accent === "uk")
    expect(us?.audioUrl).toMatch(/^https:\/\/dict\.youdao\.com\/dictvoice\?/)
    expect(uk?.audioUrl).toMatch(/^https:\/\/dict\.youdao\.com\/dictvoice\?/)
    expect(us?.audioUrl).toContain("type=2")
    expect(uk?.audioUrl).toContain("type=1")

    // pronunciation URL should be reachable
    expect(us?.audioUrl).toBeTruthy()
    const audioRes = await fetch(us?.audioUrl ?? "", { method: "GET" })
    expect(audioRes.ok).toBe(true)
    const ctype = audioRes.headers.get("content-type") ?? ""
    expect(
      ctype.includes("audio") ||
        ctype.includes("mpeg") ||
        ctype.includes("octet-stream") ||
        ctype.includes("mp3"),
    ).toBe(true)
    const buf = await audioRes.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(100)
  }, 30_000)

  test("chinese word 苹果 resolves via ce path", async () => {
    const { status, json } = await post("/v1/lookup", { q: "苹果" })
    expect(status).toBe(200)
    const lookup = json.lookup as {
      found: boolean
      explanations: Array<{ meanings: string[] }>
      paragraphs?: string[]
    }
    expect(lookup.found).toBe(true)
    expect(
      lookup.explanations.some((e) => e.meanings.some((m) => /apple/i.test(m))) ||
        String(json.translation ?? "")
          .toLowerCase()
          .includes("apple"),
    ).toBe(true)
  }, 20_000)

  test("query auto routes single word to lookup mode", async () => {
    const { status, json } = await post("/v1/query", {
      text: "hello",
      mode: "auto",
    })
    expect(status).toBe(200)
    expect(json.mode).toBe("lookup")
    expect(json.ok).toBe(true)
    const paragraphs = json.paragraphs as string[]
    expect(paragraphs.length).toBeGreaterThan(0)
    expect(paragraphs.join("")).toMatch(/你好|喂|招呼/)
  }, 20_000)
})

describe.skipIf(!runLive)("live: sentence translation", () => {
  test("english sentence to chinese", async () => {
    const { status, json } = await post("/v1/translate", {
      text: "How are you today?",
      from: "auto",
      to: "zh-CHS",
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.mode).toBe("translate")
    expect(String(json.translation)).toMatch(/你|今天|好/)
    expect((json.paragraphs as string[]).length).toBeGreaterThan(0)
    expect(json.text).toBe("How are you today?")
  }, 20_000)

  test("chinese sentence to english", async () => {
    const { status, json } = await post("/v1/translate", {
      text: "今天天气很好。",
      from: "zh-CHS",
      to: "en",
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    const t = String(json.translation).toLowerCase()
    expect(t).toMatch(/weather|nice|fine|good|today/)
  }, 20_000)

  test("query auto routes sentence to translate mode", async () => {
    const { status, json } = await post("/v1/query", {
      text: "Good morning, everyone.",
      mode: "auto",
      to: "zh-CHS",
    })
    expect(status).toBe(200)
    expect(json.mode).toBe("translate")
    expect(String(json.translation)).toMatch(/早上|大家|好/)
  }, 30_000)

  test("sentence with punctuation translates", async () => {
    const { status, json } = await post("/v1/translate", {
      text: "Hello world. This is a test of translation quality.",
      from: "en",
      to: "zh-CHS",
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(/[\u4e00-\u9fff]/.test(String(json.translation))).toBe(true)
  }, 30_000)
})

describe.skipIf(!runLive)("live: long text translation", () => {
  test("multi-paragraph text within limit", async () => {
    const text = [
      "Artificial intelligence is transforming many industries.",
      "Machine learning models can recognize images and translate languages.",
      "However, careful evaluation and human oversight remain essential.",
    ].join(" ")

    const { status, json } = await post("/v1/translate", {
      text,
      from: "en",
      to: "zh-CHS",
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    const translation = String(json.translation)
    expect(translation.length).toBeGreaterThan(20)
    // should contain chinese characters
    expect(/[\u4e00-\u9fff]/.test(translation)).toBe(true)
    expect((json.paragraphs as string[]).length).toBeGreaterThanOrEqual(1)
  }, 40_000)

  test("rejects oversized text", async () => {
    const text = "字".repeat(6000)
    const { status, json } = await post("/v1/translate", { text })
    expect(status).toBe(413)
    expect(json.ok).toBe(false)
  }, 10_000)
})

describe.skipIf(!runLive)("live: error / edge cases", () => {
  test("empty text is 400", async () => {
    const { status, json } = await post("/v1/translate", { text: "  " })
    expect(status).toBe(400)
    expect(json.ok).toBe(false)
  })

  test("health is up", async () => {
    const res = await app.fetch(new Request("http://local/health"), env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  })
})
