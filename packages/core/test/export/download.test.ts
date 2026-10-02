// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBytes, PDF_MIME } from '../../src';

describe('downloadBytes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clicks a temporary link with an object URL and cleans up', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    downloadBytes(new Uint8Array([1, 2, 3]), 'report.pdf', PDF_MIME);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    expect(blob.type).toBe(PDF_MIME);
    expect(blob.size).toBe(3);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toBe('report.pdf');
    expect(clicks[0]!.href).toBe('blob:fake');
    expect(document.querySelectorAll('a')).toHaveLength(0);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });
});

describe('downloadBytes outside a browser', () => {
  it('throws a clear error', async () => {
    const original = globalThis.document;
    // @ts-expect-error simulate a non-browser environment
    delete globalThis.document;
    try {
      expect(() => downloadBytes(new Uint8Array(), 'x.pdf', PDF_MIME)).toThrow(/browser environment/);
    } finally {
      globalThis.document = original;
    }
  });
});
