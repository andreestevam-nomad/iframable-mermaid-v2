/**
 * Compacta/descompacta texto Mermaid para uso em query params (?d=).
 * Pipeline: UTF-8 → deflate-raw → base64url
 */

import { log } from "./log.js";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function bytesToBase64Url(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function streamToUint8Array(stream) {
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function compressToParam(text) {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream não é suportado neste navegador.");
  }

  const t0 = performance.now();
  log("compress:start", { chars: text.length });
  const input = TEXT_ENCODER.encode(text);
  const stream = new Blob([input])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const compressed = await streamToUint8Array(stream);
  const param = bytesToBase64Url(compressed);
  log("compress:done", {
    paramLen: param.length,
    ms: Math.round(performance.now() - t0),
  });
  return param;
}

export async function decompressFromParam(param) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream não é suportado neste navegador.");
  }

  const compressed = base64UrlToBytes(param);
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const bytes = await streamToUint8Array(stream);
  return TEXT_DECODER.decode(bytes);
}

/** Limite pragmático para avisos (alguns proxies/apps truncam ~8KB). */
export const URL_WARN_THRESHOLD = 7500;
