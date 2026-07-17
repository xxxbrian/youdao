import { describe, expect, test } from "bun:test"
import { readJsonObject } from "../src/lib/body"
import { AppError } from "../src/lib/errors"

describe("readJsonObject", () => {
  test("parses small object", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
    })
    const obj = await readJsonObject(req)
    expect(obj.text).toBe("hi")
  })

  test("rejects oversized content-length", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    })
    try {
      await readJsonObject(req, 100)
      throw new Error("should throw")
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe("PAYLOAD_TOO_LARGE")
    }
  })
})
