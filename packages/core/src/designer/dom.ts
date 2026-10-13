/**
 * DOM helpers shared by the React and Vue design surfaces.
 *
 * The surface marks each band section (caption, band and the empty gap below
 * it) with `data-section-band="<band id>"` and the band itself with
 * `data-band-id="<band id>"`.
 */

export interface BandHit {
  bandId: string;
  /** The band element (`[data-band-id]`). */
  element: HTMLElement;
  /** Client coordinates of the band's top-left corner when the snapshot was taken. */
  left: number;
  top: number;
}

/**
 * Records where every band is on screen (call at drag start, while the
 * template is in its original state) and returns a lookup from a client y
 * coordinate to the band under it. A pointer over a caption belongs to the
 * band below the caption; above the first or below the last band it snaps to
 * that band. Returns null when there is no layout (e.g. in jsdom).
 */
export function snapshotBands(root: ParentNode): ((clientY: number) => BandHit | null) | null {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section-band]'));
  const entries = sections
    .map((section) => {
      const element = section.querySelector<HTMLElement>('[data-band-id]');
      if (!element) return null;
      const s = section.getBoundingClientRect();
      const b = element.getBoundingClientRect();
      return { bandId: section.dataset.sectionBand!, element, top: s.top, bottom: s.bottom, bandLeft: b.left, bandTop: b.top };
    })
    .filter((e): e is NonNullable<typeof e> => !!e);
  if (entries.length === 0 || entries.every((e) => e.bottom - e.top <= 0)) return null;
  return (clientY) => {
    let hit = entries.find((e) => clientY >= e.top && clientY < e.bottom);
    if (!hit) hit = clientY < entries[0]!.top ? entries[0]! : entries[entries.length - 1]!;
    return { bandId: hit.bandId, element: hit.element, left: hit.bandLeft, top: hit.bandTop };
  };
}

/** CSS class added to the band a dragged component would land in. */
export const DROP_TARGET_CLASS = 'ar-band-drop';

/**
 * Converts a rubber-band rectangle in client (screen) coordinates into one
 * rectangle per band, in each band's template coordinates, for
 * `DesignerController.selectInBands`. `scale` is CSS pixels per template unit.
 */
export function marqueeTargets(
  root: ParentNode,
  client: { left: number; top: number; right: number; bottom: number },
  scale: number,
): { bandId: string; rect: { x: number; y: number; width: number; height: number } }[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-band-id]')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      bandId: el.dataset.bandId!,
      rect: {
        x: (client.left - r.left) / scale,
        y: (client.top - r.top) / scale,
        width: (client.right - client.left) / scale,
        height: (client.bottom - client.top) / scale,
      },
    };
  });
}
