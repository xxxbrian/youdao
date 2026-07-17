import { describe, expect, test } from "bun:test"
import { dictDirectionMatchesPair } from "../src/lib/languages"

describe("dictDirectionMatchesPair", () => {
  test("en2zh accepts EN→Simplified ZH and auto", () => {
    expect(dictDirectionMatchesPair("en2zh", "en", "zh-CHS")).toBe(true)
    expect(dictDirectionMatchesPair("en2zh", "auto", "zh-Hans")).toBe(true)
    expect(dictDirectionMatchesPair("en2zh", undefined, undefined)).toBe(true)
  })

  test("en2zh rejects EN→FR and EN→Traditional ZH", () => {
    expect(dictDirectionMatchesPair("en2zh", "en", "fr")).toBe(false)
    expect(dictDirectionMatchesPair("en2zh", "en", "zh-Hant")).toBe(false)
    expect(dictDirectionMatchesPair("en2zh", "en", "zh-CHT")).toBe(false)
  })

  test("zh2en accepts ZH→EN", () => {
    expect(dictDirectionMatchesPair("zh2en", "zh-CHS", "en")).toBe(true)
    expect(dictDirectionMatchesPair("zh2en", "zh-Hans", "auto")).toBe(true)
  })

  test("zh2en rejects ZH→JA", () => {
    expect(dictDirectionMatchesPair("zh2en", "zh-CHS", "ja")).toBe(false)
  })

  test("unknown never matches", () => {
    expect(dictDirectionMatchesPair("unknown", "en", "zh-CHS")).toBe(false)
  })
})
