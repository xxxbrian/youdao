var config = require("./config.js")
var utils = require("./utils.js")

function supportLanguages() {
  return config.supportedLanguages.map((pair) => pair[0])
}

function translate(query, completion) {
  ;(async () => {
    var base = ($option.serverUrl || "http://127.0.0.1:8787").replace(/\/$/, "")
    var apiKey = $option.apiKey || ""
    var text = query.text || ""
    if (!text) {
      completion({
        error: { type: "param", message: "empty text" },
      })
      return
    }

    var from = utils.langMap.get(query.detectFrom) || "auto"
    var to = utils.langMap.get(query.detectTo) || "auto"

    var headers = {
      "Content-Type": "application/json",
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    var resp = await $http.request({
      method: "POST",
      url: `${base}/v1/query`,
      header: headers,
      body: {
        text: text,
        from: from,
        to: to,
        mode: "auto",
      },
    })

    if (resp.error) {
      completion({
        error: {
          type: "network",
          message: resp.error.localizedDescription || "network error",
          addtion: JSON.stringify(resp.error),
        },
      })
      return
    }

    var data = resp.data
    var msg = "upstream error"
    var paragraphs
    if (!data || data.ok === false) {
      msg = data?.error?.message || "upstream error"
      completion({
        error: {
          type: "api",
          message: msg,
          addtion: JSON.stringify(data),
        },
      })
      return
    }

    paragraphs = data.paragraphs
    if (!paragraphs?.length) {
      if (data.translation) {
        paragraphs = [data.translation]
      } else {
        completion({
          error: {
            type: "api",
            message: "empty translation result",
            addtion: JSON.stringify(data),
          },
        })
        return
      }
    }

    if (data.mode === "lookup" && data.lookup) {
      completion({
        result: {
          from: query.detectFrom,
          to: query.detectTo,
          fromParagraphs: text.split("\n"),
          toParagraphs: paragraphs,
          toDict: mapLookupToBob(data.lookup),
        },
      })
      return
    }

    completion({
      result: {
        from: query.detectFrom,
        to: query.detectTo,
        fromParagraphs: text.split("\n"),
        toParagraphs: paragraphs,
      },
    })
  })().catch((err) => {
    completion({
      error: {
        type: err._type || "unknown",
        message: err._message || String(err),
      },
    })
  })
}

function mapLookupToBob(lookup) {
  var toDict = {
    word: lookup.query || "",
    phonetics: [],
    parts: [],
    exchanges: [],
    additions: [],
  }

  ;(lookup.phonetics || []).forEach((p) => {
    toDict.phonetics.push({
      type: p.accent,
      value: p.text || "",
      tts: p.audioUrl ? { type: "url", value: p.audioUrl } : undefined,
    })
  })

  ;(lookup.explanations || []).forEach((e) => {
    toDict.parts.push({
      part: e.partOfSpeech || "",
      means: e.meanings || [],
    })
  })

  ;(lookup.forms || []).forEach((f) => {
    toDict.exchanges.push({
      name: f.name,
      words: f.values || [],
    })
  })

  if (lookup.tags?.length) {
    toDict.additions.push({
      name: "标签",
      value: lookup.tags.join("/"),
    })
  }

  ;(lookup.suggestions || []).forEach((s) => {
    toDict.exchanges.push({
      name: s.translation ? `您要找的是不是: ${s.translation}` : "您要找的是不是",
      words: [s.text],
    })
  })

  return toDict
}

exports.supportLanguages = supportLanguages
exports.translate = translate
