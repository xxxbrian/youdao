import { md5 } from "@noble/hashes/legacy.js"
import { bytesToHex } from "@noble/hashes/utils.js"

export function md5Hex(input: string | Uint8Array): string {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input
  return bytesToHex(md5(data))
}

export function md5Bytes(input: string | Uint8Array): Uint8Array {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input
  return md5(data)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Decode standard or URL-safe base64 into bytes. */
export function base64ToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  const b64 = normalized + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function aes128CbcDecrypt(
  ciphertextB64: string,
  keyMaterial: string,
  ivMaterial: string,
): Promise<string> {
  const keyBytes = md5Bytes(keyMaterial).slice(0, 16)
  const ivBytes = md5Bytes(ivMaterial).slice(0, 16)
  const cipherBytes = base64ToBytes(ciphertextB64)

  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  )

  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: toArrayBuffer(ivBytes) },
      key,
      toArrayBuffer(cipherBytes),
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error("AES decrypt failed")
  }
}
