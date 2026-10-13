/**
 * Shareable playground links: the whole state is compressed into the URL
 * hash, so a link works without a server. "z:" marks deflate-compressed
 * state, "p:" plain state (browsers without CompressionStream).
 */

export interface SharedState {
  v: 1;
  template: unknown;
  data: unknown;
  framework?: string;
  tab?: string;
  uiLocale?: string;
  theme?: string;
}

/** Largest state accepted from a link, to stop decompression bombs. */
const MAX_BYTES = 4 * 1024 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('The shared state is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function encodeState(state: SharedState): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream === 'undefined') return `p:${toBase64Url(bytes)}`;
  return `z:${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
}

export async function decodeState(encoded: string): Promise<SharedState> {
  const kind = encoded.slice(0, 2);
  const payload = fromBase64Url(encoded.slice(2));
  let bytes: Uint8Array;
  if (kind === 'z:') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed links');
    bytes = await pipe(payload, new DecompressionStream('deflate-raw'), MAX_BYTES);
  } else if (kind === 'p:') {
    bytes = payload;
  } else {
    throw new Error('Unknown link format');
  }
  if (bytes.length > MAX_BYTES) throw new Error('The shared state is too large');
  const state = JSON.parse(new TextDecoder().decode(bytes)) as SharedState;
  if (!state || state.v !== 1 || typeof state.template !== 'object') throw new Error('Not a playground link');
  return state;
}
