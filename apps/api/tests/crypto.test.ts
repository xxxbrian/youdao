import { describe, expect, test } from "bun:test"
import { aes128CbcDecrypt, base64ToBytes, md5Hex } from "../src/youdao/crypto"

describe("md5Hex", () => {
  test("RFC-style vectors", () => {
    expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e")
    expect(md5Hex("hello")).toBe("5d41402abc4b2a76b9719d911017c592")
  })
})

describe("base64ToBytes", () => {
  test("standard and url-safe", () => {
    const std = base64ToBytes("aGVsbG8=")
    expect(new TextDecoder().decode(std)).toBe("hello")
    const url = base64ToBytes("aGVsbG8")
    expect(new TextDecoder().decode(url)).toBe("hello")
  })
})

describe("aes128CbcDecrypt", () => {
  test("roundtrip via WebCrypto encrypt then decrypt helper path", async () => {
    // Build a known AES-128-CBC ciphertext with WebCrypto, using MD5-derived key/iv materials.
    const { md5Bytes } = await import("../src/youdao/crypto")
    const keyMat = "test-key-material"
    const ivMat = "test-iv-material"
    const keyBytes = md5Bytes(keyMat).slice(0, 16)
    const ivBytes = md5Bytes(ivMat).slice(0, 16)
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, [
      "encrypt",
      "decrypt",
    ])
    const plain = new TextEncoder().encode("你好 hello")
    const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, key, plain)
    const b64 = btoa(String.fromCharCode(...new Uint8Array(cipher)))
    const out = await aes128CbcDecrypt(b64, keyMat, ivMat)
    expect(out).toBe("你好 hello")
  })
})
