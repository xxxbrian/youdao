const config = require("./config.js")
const utils = require("./utils.js")
const mapLookup = require("./map-lookup.js")

function supportLanguages() {
  return config.supportedLanguages.map((pair) => pair[0])
}

/** Bob 1.6+：自定义超时（秒），词典/跨境请求给宽一点。 */
function pluginTimeoutInterval() {
  return 90
}

/**
 * Bob 1.8+ 现代回调：只用 query.onCompletion。
 * 词典命中只返回 toDict（不传 toParagraphs），避免底部译文区重复。
 */
function translate(query) {
  const finish = query.onCompletion

  ;(async () => {
    const base = ($option.serverUrl || "http://127.0.0.1:8787").replace(/\/$/, "")
    const apiKey = $option.apiKey || ""
    const text = query.text || ""
    if (!text) {
      finish({ error: { type: "param", message: "empty text" } })
      return
    }

    const from = utils.langMap.get(query.detectFrom) || "auto"
    const to = utils.langMap.get(query.detectTo) || "auto"

    const headers = { "Content-Type": "application/json" }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const resp = await $http.request({
      method: "POST",
      url: `${base}/v1/query`,
      header: headers,
      body: {
        text,
        from,
        to,
        mode: "auto",
      },
      // Bob 1.8+：用户取消查询时中断请求
      cancelSignal: query.cancelSignal,
    })

    if (resp.error) {
      finish({
        error: {
          type: "network",
          message: resp.error.localizedDescription || "network error",
          addition: resp.error,
        },
      })
      return
    }

    const data = resp.data
    if (!data || data.ok === false) {
      let errType = "api"
      if (data?.error?.code === "UNAUTHORIZED") errType = "secretKey"
      if (data?.error?.code === "BAD_REQUEST") errType = "param"
      finish({
        error: {
          type: errType,
          message: data?.error?.message || "upstream error",
          addition: data,
        },
      })
      return
    }

    let paragraphs = data.paragraphs
    if (!paragraphs?.length && data.translation) {
      paragraphs = [data.translation]
    }

    // —— 词典 ——
    if (data.mode === "lookup" && data.lookup) {
      const mapped = mapLookup.mapLookupToBob(data.lookup)
      const result = {
        from: query.detectFrom,
        to: query.detectTo,
        fromParagraphs: text.split("\n"),
        toDict: mapped.toDict,
      }
      if (mapped.fromTTS) result.fromTTS = mapped.fromTTS
      if (mapped.toTTS) result.toTTS = mapped.toTTS

      // 弱结果（未命中等）才用 toParagraphs 兜底
      if (!hasRichToDict(mapped.toDict)) {
        if (!paragraphs?.length) {
          finish({
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

      finish({ result })
      return
    }

    // —— 句子翻译 ——
    if (!paragraphs?.length) {
      finish({
        error: {
          type: "api",
          message: "empty translation result",
          addition: data,
        },
      })
      return
    }

    // Bob 会在 toParagraphs 每个元素之间自动插入空行，故合并为单个元素。
    // API 已清洗空段并用 \n\n 连接；优先用 translation 字段。
    const body =
      typeof data.translation === "string" && data.translation.length
        ? data.translation
        : paragraphs.join("\n\n")
    finish({
      result: {
        from: query.detectFrom,
        to: query.detectTo,
        fromParagraphs: [text],
        toParagraphs: [body],
      },
    })
  })().catch((err) => {
    finish({
      error: {
        type: err._type || "unknown",
        message: err._message || String(err),
      },
    })
  })
}

/** toDict 足够丰富时，Bob 只渲染词典区，无需 toParagraphs。 */
function hasRichToDict(toDict) {
  if (!toDict) return false
  if (toDict.parts?.length) return true
  if (toDict.relatedWordParts?.length) return true
  return false
}

exports.supportLanguages = supportLanguages
exports.pluginTimeoutInterval = pluginTimeoutInterval
exports.translate = translate
exports.hasRichToDict = hasRichToDict
