import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { buildLookupParagraphs } from "../src/routes/v1"
import { parseDictPayload } from "../src/youdao/dict"

const require = createRequire(import.meta.url)
const { mapLookupToBob } = require("../../bob-plugin/src/map-lookup.js") as {
  mapLookupToBob: (lookup: unknown) => {
    toDict: Record<string, unknown>
    fromTTS?: { type: string; value: string }
  }
}

const FIX = join(import.meta.dir, "fixtures/dict")

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(FIX, name), "utf8"))
}

describe("Bob mapLookupToBob", () => {
  test("english apple shape", () => {
    const lookup = parseDictPayload("apple", load("apple.json"))
    const { toDict, fromTTS } = mapLookupToBob(lookup)
    expect(toDict.word).toBe("apple")
    const phonetics = toDict.phonetics as Array<{ type: string }>
    expect(phonetics.every((p) => p.type === "us" || p.type === "uk")).toBe(true)
    expect((toDict.parts as unknown[]).length).toBeGreaterThan(0)
    expect(fromTTS?.type).toBe("url")
  })

  test("chinese 决定性: relatedWordParts, no fake us, pinyin addition, fromTTS", () => {
    const lookup = parseDictPayload("决定性", load("决定性.json"))
    const { toDict, fromTTS } = mapLookupToBob(lookup)
    expect(toDict.word).toBeUndefined()
    expect(toDict.phonetics).toBeUndefined()
    const rwp = toDict.relatedWordParts as Array<{ part?: string; words: unknown[] }>
    expect(rwp?.length).toBe(1)
    expect(rwp[0]?.part).toBeUndefined()
    expect(rwp[0]?.words.length).toBeGreaterThan(0)
    const additions = toDict.additions as Array<{ name: string; value: string }>
    expect(additions.some((a) => a.name === "拼音" && a.value)).toBe(true)
    expect(fromTTS?.type).toBe("url")

    const paragraphs = buildLookupParagraphs(lookup)
    expect(paragraphs[0]).toBe(lookup.relatedWords[0]?.word)
  })

  test("愤怒 paragraphs first related only", () => {
    const lookup = parseDictPayload("愤怒", load("愤怒.json"))
    const paragraphs = buildLookupParagraphs(lookup)
    expect(paragraphs[0]).toBe(lookup.relatedWords[0]?.word)
    expect(paragraphs[0]).not.toContain(",")
  })

  test("en2zh paragraphs are short means without POS prefix", () => {
    const lookup = parseDictPayload("apple", load("apple.json"))
    const paragraphs = buildLookupParagraphs(lookup)
    expect(paragraphs.length).toBe(1)
    expect(paragraphs[0]).not.toMatch(/^(n\.|v\.|adj\.)\s/)
    expect(paragraphs[0]).toContain("苹果")
  })
})
