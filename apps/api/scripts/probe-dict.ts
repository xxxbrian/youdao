import { md5Hex } from "../src/youdao/crypto"
import { youdaoHeaders } from "../src/youdao/headers"
import { resolveCookie } from "../src/youdao/session"

async function rawDict(q: string) {
  const keyfrom = "webdict"
  const client = "web"
  const secret = "Mk6hqtUp33DGGtoS63tTJbMUYjRrG1Lu"
  const time = `${q}${keyfrom}`.length % 10
  const o = md5Hex(`${q}${keyfrom}`)
  const sign = md5Hex(`${client}${q}${time}${secret}${o}`)
  const body = new URLSearchParams({ q, keyfrom, sign, client, t: String(time) })
  const res = await fetch("https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4", {
    method: "POST",
    headers: {
      ...youdaoHeaders(resolveCookie()),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  return (await res.json()) as Record<string, unknown>
}

function summarize(q: string, j: Record<string, unknown>) {
  const meta = asRec(j.meta)
  const out: Record<string, unknown> = {
    q,
    topKeys: Object.keys(j),
    meta: meta
      ? {
          guessLanguage: meta.guessLanguage,
          lang: meta.lang,
          le: meta.le,
          dicts: meta.dicts,
        }
      : null,
  }

  const ec = asRec(j.ec)
  const ecWordRaw = ec?.word
  const ecWord = Array.isArray(ecWordRaw) ? asRec(ecWordRaw[0]) : asRec(ecWordRaw)
  if (ecWord) {
    out.ec = {
      usphone: ecWord.usphone,
      ukphone: ecWord.ukphone,
      usspeech: ecWord.usspeech,
      ukspeech: ecWord.ukspeech,
      trs: asArr(ecWord.trs).slice(0, 4),
      wfs: ecWord.wfs,
      prototype: ecWord.prototype,
      exam_type: ec?.exam_type,
    }
  }

  const ce = asRec(j.ce)
  const ceWord = asRec(ce?.word)
  if (ceWord) {
    out.ce = {
      phone: ceWord.phone,
      returnPhrase: ceWord["return-phrase"],
      trs: asArr(ceWord.trs).slice(0, 6),
    }
  }

  const ceNew = asRec(j.ce_new)
  if (ceNew?.word) {
    const w0 = Array.isArray(ceNew.word) ? ceNew.word[0] : ceNew.word
    out.ce_new_sample = w0
  }

  if (j.simple) out.simple = j.simple

  const nh = asRec(j.newhh)
  if (nh) {
    out.newhh = {
      word: nh.word,
      first: asArr(nh.dataList)[0] ?? null,
    }
  }

  const wt = asRec(j.web_trans)
  const list = asArr(wt?.["web-translation"])
  if (list.length) {
    out.web_trans = list.slice(0, 3).map((x) => {
      const rec = asRec(x)
      return {
        key: rec?.key,
        values: asArr(rec?.trans)
          .map((t) => asRec(t)?.value)
          .filter(Boolean)
          .slice(0, 4),
      }
    })
  }

  if (j.typos) out.typos = j.typos

  const blng = asRec(j.blng_sents_part)
  const pairs = asArr(blng?.["sentence-pair"])
  if (pairs.length) {
    const p0 = asRec(pairs[0])
    out.blng = {
      count: blng?.["sentence-count"],
      first: {
        sentence: p0?.sentence,
        translation: p0?.["sentence-translation"],
      },
    }
  }

  return out
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

const cases = [
  "apple",
  "running",
  "decide",
  "good",
  "决定性",
  "苹果",
  "你好",
  "愤怒",
  "AI",
  "COVID-19",
  "helo",
  "こんにちは",
]

for (const q of cases) {
  try {
    const j = await rawDict(q)
    console.log(`\n########## ${q}`)
    console.log(JSON.stringify(summarize(q, j), null, 2).slice(0, 4000))
  } catch (e) {
    console.log("ERR", q, e)
  }
}
