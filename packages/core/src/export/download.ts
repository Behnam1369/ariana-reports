export const PDF_MIME = 'application/pdf';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Turns a report name into a safe file name, e.g. "Q1 / Sales" -> "Q1 - Sales". */
export function safeFileName(name: string, extension: string): string {
  const base =
    name
      .replace(/\s*[\\/:*?"<>|][\s\\/:*?"<>|]*/g, ' - ')
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s-]+|[.\s-]+$/g, '') || 'report';
  return `${base.slice(0, 120)}.${extension}`;
}

/** Triggers a browser download of the given bytes. Browser only. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('downloadBytes() requires a browser environment');
  }
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoke on the next tick so the download can start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
