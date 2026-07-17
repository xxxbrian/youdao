import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseDictPayload } from "../src/youdao/dict"

const FIX = join(import.meta.dir, "fixtures/dict")

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(FIX, name), "utf8"))
}

describe("parseDictPayload fixtures", () => {
  test("apple en2zh", () => {
    const r = parseDictPayload("apple", load("apple.json"))
    expect(r.found).toBe(true)
    expect(r.direction).toBe("en2zh")
    expect(r.phonetics.some((p) => p.accent === "us")).toBe(true)
    expect(r.phonetics.some((p) => p.accent === "uk")).toBe(true)
    expect(r.explanations.length).toBeGreaterThan(0)
    expect(r.explanations[0]?.meanings.join("")).toContain("苹果")
    expect(r.forms.some((f) => f.name === "复数")).toBe(true)
    expect(r.tags.length).toBeGreaterThan(0)
    expect(r.relatedWords.length).toBe(0)
  })

  test("good has exchanges", () => {
    const r = parseDictPayload("good", load("good.json"))
    expect(r.found).toBe(true)
    expect(r.direction).toBe("en2zh")
    expect(r.forms.some((f) => f.name === "比较级")).toBe(true)
    expect(r.forms.some((f) => f.name === "最高级")).toBe(true)
  })

  test("COVID-19 no phone still found", () => {
    const r = parseDictPayload("COVID-19", load("COVID-19.json"))
    expect(r.found).toBe(true)
    expect(r.direction).toBe("en2zh")
    expect(r.explanations.length).toBeGreaterThan(0)
  })

  test("决定性 zh2en", () => {
    const r = parseDictPayload("决定性", load("决定性.json"))
    expect(r.found).toBe(true)
    expect(r.direction).toBe("zh2en")
    expect(r.relatedWords.length).toBeGreaterThan(0)
    expect(r.relatedWords[0]?.word).toBeTruthy()
    expect(r.phonetics.some((p) => p.accent === "pinyin" && p.text)).toBe(true)
    // must NOT invent us phonetics for each English candidate
    expect(r.phonetics.every((p) => p.accent === "pinyin")).toBe(true)
    expect(r.explanations.some((e) => e.meanings.join("").includes("决定"))).toBe(true)
  })

  test("愤怒 multi relatedWords", () => {
    const r = parseDictPayload("愤怒", load("愤怒.json"))
    expect(r.found).toBe(true)
    expect(r.direction).toBe("zh2en")
    expect(r.relatedWords.length).toBeGreaterThan(2)
    expect(r.relatedWords.some((w) => /anger|rage|indignation/i.test(w.word))).toBe(true)
  })

  test("苹果 pinyin fallback", () => {
    const r = parseDictPayload("苹果", load("苹果.json"))
    expect(r.found).toBe(true)
    expect(r.direction).toBe("zh2en")
    expect(r.relatedWords.some((w) => w.word.toLowerCase() === "apple")).toBe(true)
    expect(r.phonetics.some((p) => p.accent === "pinyin")).toBe(true)
  })

  test("こんにちは found false", () => {
    const r = parseDictPayload("こんにちは", load("konnichiwa.json"))
    expect(r.found).toBe(false)
    expect(r.direction).toBe("unknown")
  })

  test("applle typos not found", () => {
    const r = parseDictPayload("applle", load("applle.json"))
    expect(r.found).toBe(false)
    expect(r.suggestions.length).toBeGreaterThan(0)
  })

  test("xyzzyqqq web-only / empty found false", () => {
    const r = parseDictPayload("xyzzyqqq", load("xyzzyqqq.json"))
    expect(r.found).toBe(false)
    expect(r.direction).toBe("unknown")
  })
})
