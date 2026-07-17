var config = require("./config.js")
var utils = require("./utils.js")
var mapLookup = require("./map-lookup.js")

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
          addition: resp.error,
        },
      })
      return
    }

    var data = resp.data
    var msg = "upstream error"
    var paragraphs
    var errType
    var mapped
    var result
    if (!data || data.ok === false) {
      msg = data?.error?.message || "upstream error"
      errType = "api"
      if (data?.error?.code === "UNAUTHORIZED") errType = "secretKey"
      if (data?.error?.code === "BAD_REQUEST") errType = "param"
      completion({
        error: {
          type: errType,
          message: msg,
          addition: data,
        },
      })
      return
    }

    paragraphs = data.paragraphs
    if (!paragraphs?.length) {
      if (data.translation) {
        paragraphs = [data.translation]
      } else if (!(data.mode === "lookup" && data.lookup)) {
        completion({
          error: {
            type: "api",
            message: "empty translation result",
            addition: data,
          },
        })
        return
      }
    }

    // Dictionary hit: Bob renders toDict (parts / relatedWordParts).
    // Do NOT also pass toParagraphs — that creates the duplicate bottom block.
    // Bob 1.6.0+ allows toDict without toParagraphs.
    if (data.mode === "lookup" && data.lookup) {
      mapped = mapLookup.mapLookupToBob(data.lookup)
      result = {
        from: query.detectFrom,
        to: query.detectTo,
        fromParagraphs: text.split("\n"),
        toDict: mapped.toDict,
      }
      if (mapped.fromTTS) result.fromTTS = mapped.fromTTS
      if (mapped.toTTS) result.toTTS = mapped.toTTS

      // Miss / weak dict: no parts or relatedWordParts → need toParagraphs
      if (!hasRichToDict(mapped.toDict)) {
        if (!paragraphs?.length) {
          completion({
            error: {
              type: "api",
              message: "empty dictionary result",
              addition: data,
            },
          })
          return
        }
        result.toParagraphs = paragraphs
      }

      completion({ result: result })
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

/** True when toDict alone is enough for Bob to render a dictionary card. */
function hasRichToDict(toDict) {
  if (!toDict) return false
  if (toDict.parts?.length) return true
  if (toDict.relatedWordParts?.length) return true
  return false
}

exports.supportLanguages = supportLanguages
exports.translate = translate
exports.hasRichToDict = hasRichToDict
