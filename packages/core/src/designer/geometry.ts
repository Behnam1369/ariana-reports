export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** A guide line shown while snapping, in band coordinates. */
export interface Guide {
  orientation: 'vertical' | 'horizontal';
  /** x for vertical guides, y for horizontal guides. */
  position: number;
}

/** Rounds to a fixed number of decimals so template JSON stays tidy. */
export function round(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function snapToGrid(value: number, grid: number): number {
  if (!(grid > 0)) return value;
  return round(Math.round(value / grid) * grid);
}

/**
 * Finds the closest target within `tolerance` for any of the candidate
 * edges. Returns the offset to apply and the matched position.
 */
export function snapEdges(
  candidates: number[],
  targets: number[],
  tolerance: number,
): { offset: number; position: number } | null {
  let best: { offset: number; position: number } | null = null;
  for (const c of candidates) {
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) <= tolerance && (!best || Math.abs(d) < Math.abs(best.offset))) best = { offset: d, position: t };
    }
  }
  return best;
}

export interface SnapOptions {
  /** Grid size in template units; 0 disables grid snapping. */
  grid: number;
  /** Snap distance to other components' edges, in template units; 0 disables. */
  tolerance: number;
}

/**
 * Snaps a moved rectangle: first to edges and centers of `others` (and the
 * band bounds), otherwise to the grid. Returns the snapped rect and guides.
 */
export function snapMove(rect: Rect, others: Rect[], bounds: Rect, options: SnapOptions): { rect: Rect; guides: Guide[] } {
  const guides: Guide[] = [];
  let { x, y } = rect;
  const xs = [bounds.x, bounds.x + bounds.width, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])];
  const ys = [bounds.y, bounds.y + bounds.height, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])];

  const sx = options.tolerance > 0 ? snapEdges([x, x + rect.width / 2, x + rect.width], xs, options.tolerance) : null;
  if (sx) {
    x += sx.offset;
    guides.push({ orientation: 'vertical', position: round(sx.position) });
  } else {
    x = snapToGrid(x, options.grid);
  }
  const sy = options.tolerance > 0 ? snapEdges([y, y + rect.height / 2, y + rect.height], ys, options.tolerance) : null;
  if (sy) {
    y += sy.offset;
    guides.push({ orientation: 'horizontal', position: round(sy.position) });
  } else {
    y = snapToGrid(y, options.grid);
  }
  return { rect: { ...rect, x: round(x), y: round(y) }, guides };
}

/** Keeps a rectangle's position non-negative (components may not start left of or above their band). */
export function clampPosition(rect: Rect): Rect {
  return { ...rect, x: Math.max(0, rect.x), y: Math.max(0, rect.y) };
}

/**
 * Applies a resize drag. `dx`/`dy` are the pointer movement in template
 * units. The opposite edge stays fixed; sizes never go below `minSize`.
 */
export function resizeRect(rect: Rect, handle: ResizeHandle, dx: number, dy: number, grid = 0, minSize = 1): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  const snap = (v: number) => snapToGrid(v, grid);
  if (handle.includes('w')) left = Math.min(snap(left + dx), right - minSize);
  if (handle.includes('e')) right = Math.max(snap(right + dx), left + minSize);
  if (handle.includes('n')) top = Math.min(snap(top + dy), bottom - minSize);
  if (handle.includes('s')) bottom = Math.max(snap(bottom + dy), top + minSize);
  left = Math.max(0, left);
  top = Math.max(0, top);
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) };
}

/** Aligns rectangles to the bounding box of the group (or to `reference` when given). */
export function alignRects(rects: Rect[], alignment: Alignment, reference?: Rect): Rect[] {
  if (rects.length === 0) return [];
  const minX = reference ? reference.x : Math.min(...rects.map((r) => r.x));
  const maxX = reference ? reference.x + reference.width : Math.max(...rects.map((r) => r.x + r.width));
  const minY = reference ? reference.y : Math.min(...rects.map((r) => r.y));
  const maxY = reference ? reference.y + reference.height : Math.max(...rects.map((r) => r.y + r.height));
  return rects.map((r) => {
    switch (alignment) {
      case 'left':
        return { ...r, x: round(minX) };
      case 'right':
        return { ...r, x: round(maxX - r.width) };
      case 'center':
        return { ...r, x: round((minX + maxX) / 2 - r.width / 2) };
      case 'top':
        return { ...r, y: round(minY) };
      case 'bottom':
        return { ...r, y: round(maxY - r.height) };
      case 'middle':
        return { ...r, y: round((minY + maxY) / 2 - r.height / 2) };
    }
  });
}

/** Spreads rectangles so the gaps between them are equal. Order follows position. */
export function distributeRects(rects: Rect[], axis: 'horizontal' | 'vertical'): Rect[] {
  if (rects.length < 3) return rects.map((r) => ({ ...r }));
  const pos = axis === 'horizontal' ? 'x' : 'y';
  const size = axis === 'horizontal' ? 'width' : 'height';
  const order = rects.map((r, i) => i).sort((a, b) => rects[a]![pos] - rects[b]![pos]);
  const first = rects[order[0]!]!;
  const last = rects[order[order.length - 1]!]!;
  const total = rects.reduce((s, r) => s + r[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (rects.length - 1);
  const out = rects.map((r) => ({ ...r }));
  let cursor = first[pos];
  for (const i of order) {
    out[i]![pos] = round(cursor);
    cursor += rects[i]![size] + gap;
  }
  return out;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Rectangle spanning two points (for rubber-band selection). */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}
