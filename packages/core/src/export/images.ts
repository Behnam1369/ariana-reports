export type ImageType = 'png' | 'jpeg';

export interface LoadedImage {
  bytes: Uint8Array;
  type: ImageType;
}

/**
 * Resolves an image `src` to bytes. Return null to skip the image.
 * The default loader decodes data URIs and fetches http(s) URLs.
 */
export type ImageLoader = (src: string) => Promise<Uint8Array | ArrayBuffer | null>;

/** Detects PNG and JPEG by their magic bytes. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return null;
}

/** Decodes a base64 or percent-encoded data URI. Returns null if `src` is not a data URI. */
export function decodeDataUri(src: string): Uint8Array | null {
  const m = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(src);
  if (!m) return null;
  const payload = m[3]!;
  if (m[2]) {
    const binary = atob(payload.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

export const defaultImageLoader: ImageLoader = async (src) => {
  const data = decodeDataUri(src);
  if (data) return data;
  if (/^https?:\/\//i.test(src) || src.startsWith('/') || src.startsWith('./')) {
    if (typeof fetch !== 'function') return null;
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return null;
};

/** Loads and identifies images once per src. */
export class ImageCache {
  private readonly cache = new Map<string, Promise<LoadedImage | null>>();

  constructor(
    private readonly loader: ImageLoader,
    private readonly warn: (message: string) => void,
  ) {}

  get(src: string): Promise<LoadedImage | null> {
    let hit = this.cache.get(src);
    if (!hit) {
      hit = this.load(src);
      this.cache.set(src, hit);
    }
    return hit;
  }

  private async load(src: string): Promise<LoadedImage | null> {
    const label = src.length > 60 ? `${src.slice(0, 57)}...` : src;
    try {
      const raw = await this.loader(src);
      if (!raw) return null;
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const type = detectImageType(bytes);
      if (!type) {
        this.warn(`Image "${label}" is not a PNG or JPEG and was skipped`);
        return null;
      }
      return { bytes, type };
    } catch (err) {
      this.warn(`Image "${label}" could not be loaded: ${(err as Error).message}`);
      return null;
    }
  }
}

export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Computes where an image of the given natural size is drawn inside a box. */
export function fitImage(
  box: FitBox,
  naturalWidth: number,
  naturalHeight: number,
  fit: 'contain' | 'cover' | 'fill' | 'none',
): FitBox {
  if (fit === 'fill' || naturalWidth <= 0 || naturalHeight <= 0) return { ...box };
  let width: number;
  let height: number;
  if (fit === 'none') {
    // Natural size in CSS pixels, converted to points.
    width = (naturalWidth * 72) / 96;
    height = (naturalHeight * 72) / 96;
  } else {
    const scale =
      fit === 'contain'
        ? Math.min(box.width / naturalWidth, box.height / naturalHeight)
        : Math.max(box.width / naturalWidth, box.height / naturalHeight);
    width = naturalWidth * scale;
    height = naturalHeight * scale;
  }
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}
