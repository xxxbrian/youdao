/**
 * Pure mapper: API lookup payload → Bob toDict / TTS fields.
 * Keep free of Bob runtime globals so it can be unit-tested.
 */

/**
 * @param {object} lookup - API LookupResult
 * @returns {{ toDict: object, fromTTS?: object, toTTS?: object }}
 */
function mapLookupToBob(lookup) {
  if (!lookup) {
    return { toDict: {} }
  }

  if (lookup.direction === "zh2en" || lookup.relatedWords?.length) {
    return mapZh2En(lookup)
  }
  return mapEn2Zh(lookup)
}

function mapEn2Zh(lookup) {
  var toDict = {
    word: lookup.query || "",
    phonetics: [],
    parts: [],
    exchanges: [],
    additions: [],
  }

  for (const p of lookup.phonetics || []) {
    if (p.accent !== "us" && p.accent !== "uk") continue
    var item = { type: p.accent }
    if (p.text) item.value = p.text
    if (p.audioUrl) item.tts = { type: "url", value: p.audioUrl }
    if (item.value || item.tts) toDict.phonetics.push(item)
  }

  for (const e of lookup.explanations || []) {
    var part = { means: e.meanings || [] }
    if (e.partOfSpeech) part.part = e.partOfSpeech
    if (part.means.length) toDict.parts.push(part)
  }

  for (const f of lookup.forms || []) {
    toDict.exchanges.push({
      name: f.name,
      words: f.values || [],
    })
  }

  if (lookup.tags?.length) {
    toDict.additions.push({ name: "标签", value: lookup.tags.join("/") })
  }
  appendCommonAdditions(toDict, lookup)

  for (const s of lookup.suggestions || []) {
    toDict.exchanges.push({
      name: s.translation ? `您要找的是不是: ${s.translation}` : "您要找的是不是",
      words: [s.text],
    })
  }

  if (!toDict.phonetics.length) delete toDict.phonetics
  if (!toDict.parts.length) delete toDict.parts
  if (!toDict.exchanges.length) delete toDict.exchanges
  if (!toDict.additions.length) delete toDict.additions

  var result = { toDict: toDict }
  var us = (lookup.phonetics || []).find((p) => p.accent === "us" && p.audioUrl)
  if (us) result.fromTTS = { type: "url", value: us.audioUrl }
  return result
}

function mapZh2En(lookup) {
  var toDict = {}
  var related = []

  for (const w of lookup.relatedWords || []) {
    if (!w.word) continue
    var entry = { word: w.word }
    if (w.means?.length) entry.means = w.means
    related.push(entry)
  }

  if (related.length) {
    toDict.relatedWordParts = [{ words: related }]
  }

  var parts = []
  for (const e of lookup.explanations || []) {
    if (!e.meanings?.length) continue
    var part = { means: e.meanings }
    if (e.partOfSpeech) part.part = e.partOfSpeech
    parts.push(part)
  }
  if (parts.length) toDict.parts = parts

  toDict.additions = []
  var pinyin = (lookup.phonetics || []).find((p) => p.accent === "pinyin" && p.text)
  if (pinyin) {
    toDict.additions.push({ name: "拼音", value: pinyin.text })
  }
  appendCommonAdditions(toDict, lookup)
  if (!toDict.additions.length) delete toDict.additions

  var result = { toDict: toDict }
  if (pinyin?.audioUrl) {
    result.fromTTS = { type: "url", value: pinyin.audioUrl }
  }
  return result
}

function appendCommonAdditions(toDict, lookup) {
  if (!toDict.additions) toDict.additions = []
  var lines
  var ex

  if (lookup.webTranslations?.length) {
    lines = lookup.webTranslations.slice(0, 5).map((w) => {
      return `${w.phrase}: ${(w.meanings || []).join(" / ")}`
    })
    toDict.additions.push({ name: "网络释义", value: lines.join("\n") })
  }
  if (lookup.examples?.length) {
    ex = lookup.examples
      .slice(0, 3)
      .map((e) => `${e.source}\n${e.target}`)
      .join("\n\n")
    toDict.additions.push({ name: "例句", value: ex })
  }
  for (const e of lookup.extras || []) {
    if (e.name && e.value) toDict.additions.push({ name: e.name, value: e.value })
  }
}

module.exports = { mapLookupToBob }
