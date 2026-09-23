import { describe, expect, test } from "bun:test"
import {
  describeSourceMismatch,
  normalizeSrc,
  sourcesMatch,
  squashSrc,
} from "../src/youdao/source-match"

describe("sourcesMatch", () => {
  test("identical text matches", () => {
    expect(sourcesMatch("Hello world.", "Hello world.")).toBe(true)
  })

  test("regression: Youdao re-segmentation inserts a space after a period", () => {
    // Real log line that produced a false "invalid signature" error.
    const input =
      "Services The core services are customizable.The services enabled below will be used."
    const upstream =
      "Services The core services are customizable. The services enabled below will be used."
    expect(sourcesMatch(input, upstream)).toBe(true)
    expect(sourcesMatch(upstream, input)).toBe(true)
  })

  test("regression: multi-paragraph rebuild has no newlines in src", () => {
    const input = "Line one.\n\nLine two."
    expect(sourcesMatch(input, "Line one. Line two.")).toBe(true)
  })

  test("collapses runs of spaces and trailing whitespace", () => {
    expect(sourcesMatch("a  b", "a b")).toBe(true)
    expect(sourcesMatch("a\nb", "a b")).toBe(true)
    expect(sourcesMatch("  a b \n", "a b")).toBe(true)
  })

  test("ignores zero-width characters", () => {
    expect(sourcesMatch("hello", "hel\u200blo\ufeff")).toBe(true)
    expect(sourcesMatch("a\u200db", "ab")).toBe(true)
  })

  test("space insertion between CJK and latin is tolerated", () => {
    expect(sourcesMatch("你好world", "你好 world")).toBe(true)
    expect(sourcesMatch("我们已经完成。Next step.", "我们已经完成。 Next step.")).toBe(true)
  })

  test("NFC normalization applies", () => {
    // "é" as e + combining acute vs precomposed é
    expect(sourcesMatch("cafe\u0301", "caf\u00e9")).toBe(true)
  })

  test("real differences still fail", () => {
    expect(sourcesMatch("hello world", "goodbye world")).toBe(false)
    expect(sourcesMatch("apple", "orange")).toBe(false)
    expect(sourcesMatch("The cat sat.", "The dog sat.")).toBe(false)
  })

  test("punctuation differences are NOT tolerated", () => {
    // Verified live: Youdao echoes punctuation verbatim, so a punctuation
    // change means the payload is not the caller's text.
    expect(sourcesMatch("Wait... what", "Wait… what")).toBe(false)
    expect(sourcesMatch('He said "hi"', "He said “hi”")).toBe(false)
    expect(sourcesMatch("A-B test", "A–B test")).toBe(false)
  })

  test("traditional/simplified differences are NOT tolerated", () => {
    // Verified live: zh-CHT->zh-CHS does not convert src, so a script change
    // is a strong invalid-payload signal.
    expect(sourcesMatch("這是一個測試。", "这是一个测试。")).toBe(false)
    expect(sourcesMatch("軟體與資料庫", "软件与数据库")).toBe(false)
  })

  test("measured Youdao segment-boundary spacing cases match", () => {
    // All confirmed from the live endpoint (see source-match.ts header).
    expect(sourcesMatch("One!Two?Three", "One! Two? Three")).toBe(true)
    expect(sourcesMatch("Wait... what happened?", "Wait...  what happened?")).toBe(true)
    expect(sourcesMatch("  leading space", "leading space")).toBe(true)
    expect(sourcesMatch("trailing space ", "trailing space")).toBe(true)
    // and the cases Youdao leaves untouched must still match exactly
    expect(sourcesMatch("One.Two.Three", "One.Two.Three")).toBe(true)
    expect(sourcesMatch("Hello , world .", "Hello , world .")).toBe(true)
    expect(sourcesMatch("Cost is 1,234.56 USD (approx).", "Cost is 1,234.56 USD (approx).")).toBe(
      true,
    )
  })

  test("truncated upstream fails", () => {
    expect(sourcesMatch("one two three", "one two")).toBe(false)
  })

  test("reordered words fail", () => {
    expect(sourcesMatch("alpha beta", "beta alpha")).toBe(false)
  })

  test("empty upstream never matches non-empty input", () => {
    expect(sourcesMatch("hello", "")).toBe(false)
    expect(sourcesMatch("hello", "   \n ")).toBe(false)
  })

  test("both empty is a match (caller rejects empty src earlier)", () => {
    expect(sourcesMatch("", "  ")).toBe(true)
  })
})

describe("normalizeSrc", () => {
  test("keeps single newlines as paragraph hints, collapses spaces", () => {
    expect(normalizeSrc("a  \n\n  b")).toBe("a\nb")
  })

  test("trims surrounding blank space", () => {
    expect(normalizeSrc("\n a \n\n")).toBe("a")
  })
})

describe("squashSrc", () => {
  test("removes all whitespace", () => {
    expect(squashSrc(" a b\n\tc ")).toBe("abc")
  })
})

describe("describeSourceMismatch", () => {
  test("reports first differing index and truncation", () => {
    const d = describeSourceMismatch("hello world", "hello there")
    expect(d.index).toBe(5) // after squash: "helloworld" vs "hellothere"
    expect(d.inputLength).toBe(10) // squashed "helloworld"
    expect(d.upstreamLength).toBe(10) // squashed "hellothere"
    expect(d.truncated).toBe(false)
  })

  test("flags truncation when upstream is shorter", () => {
    const d = describeSourceMismatch("one two three", "one two")
    expect(d.truncated).toBe(true)
    expect(d.index).toBe(6) // after squash: "onetwothree" vs "onetwo"
    expect(d.inputLength).toBe(11) // squashed "onetwothree"
    expect(d.upstreamLength).toBe(6) // squashed "onetwo"
  })
})
