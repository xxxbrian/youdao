import { describe, expect, test } from "bun:test"
import { isLookupCandidate } from "../src/lib/query-mode"

describe("isLookupCandidate", () => {
  test("single english word", () => {
    expect(isLookupCandidate("hello")).toBe(true)
    expect(isLookupCandidate("don't")).toBe(true)
  })
  test("chinese term", () => {
    expect(isLookupCandidate("苹果")).toBe(true)
  })
  test("sentences are not lookup", () => {
    expect(isLookupCandidate("hello world")).toBe(false)
    expect(isLookupCandidate("你好，世界")).toBe(false)
  })
  test("too long", () => {
    expect(isLookupCandidate("a".repeat(40))).toBe(false)
  })
})
