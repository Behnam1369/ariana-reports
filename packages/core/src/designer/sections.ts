import type { Band, DataRegion, Group, ReportTemplate } from '../model/types';
import { convertUnit } from '../model/units';
import type { Unit } from '../model/types';
import type { BandRole } from '../model/walk';

/** A band as shown on the design surface, top to bottom. */
export interface DesignSection {
  band: Band;
  role: BandRole;
  /** Human-readable caption, e.g. "Group header: row.customer". */
  label: string;
  /** Data region the band belongs to. */
  region?: DataRegion;
  group?: Group;
  /** Nesting level of the region (0 for top-level regions and page bands). */
  depth: number;
  /** Data source name or relation path that provides `row` in this band. */
  dataContext?: string;
}

const PAGE_LABELS: Record<string, string> = {
  reportHeader: 'Report header',
  pageHeader: 'Page header',
  pageFooter: 'Page footer',
  reportFooter: 'Report footer',
};

function regionSections(region: DataRegion, depth: number, out: DesignSection[]): void {
  const source = region.dataSource ?? (region.relation ? `parent.${region.relation}` : '');
  const base = { region, depth, dataContext: source };
  if (region.header) out.push({ ...base, band: region.header, role: 'regionHeader', label: `Header: ${source}` });
  for (const group of region.groups ?? []) {
    if (group.header) out.push({ ...base, band: group.header, role: 'groupHeader', group, label: `Group header: ${group.expression}` });
  }
  out.push({ ...base, band: region.detail, role: 'detail', label: `Detail: ${source}` });
  for (const child of region.children ?? []) regionSections(child, depth + 1, out);
  for (const group of [...(region.groups ?? [])].reverse()) {
    if (group.footer) out.push({ ...base, band: group.footer, role: 'groupFooter', group, label: `Group footer: ${group.expression}` });
  }
  if (region.footer) out.push({ ...base, band: region.footer, role: 'regionFooter', label: `Footer: ${source}` });
}

/** Lists every band of a template in design order with captions for the design surface. */
export function designSections(template: ReportTemplate): DesignSection[] {
  const out: DesignSection[] = [];
  if (template.reportHeader) out.push({ band: template.reportHeader, role: 'reportHeader', label: PAGE_LABELS.reportHeader!, depth: 0 });
  if (template.pageHeader) out.push({ band: template.pageHeader, role: 'pageHeader', label: PAGE_LABELS.pageHeader!, depth: 0 });
  template.body.forEach((item, i) => {
    if (item.kind === 'band') out.push({ band: item, role: 'static', label: `Band ${i + 1}`, depth: 0 });
    else regionSections(item, 0, out);
  });
  if (template.pageFooter) out.push({ band: template.pageFooter, role: 'pageFooter', label: PAGE_LABELS.pageFooter!, depth: 0 });
  if (template.reportFooter) out.push({ band: template.reportFooter, role: 'reportFooter', label: PAGE_LABELS.reportFooter!, depth: 0 });
  return out;
}

/** Finds a data region (at any depth) by id, with its parent region. */
export function findRegion(
  template: ReportTemplate,
  id: string,
): { region: DataRegion; parent: DataRegion | null; list: DataRegion[] | null; bodyIndex: number } | undefined {
  const visit = (regions: DataRegion[], parent: DataRegion): ReturnType<typeof findRegion> => {
    for (const r of regions) {
      if (r.id === id) return { region: r, parent, list: regions, bodyIndex: -1 };
      const hit = visit(r.children ?? [], r);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const [i, item] of template.body.entries()) {
    if (item.kind !== 'dataRegion') continue;
    if (item.id === id) return { region: item, parent: null, list: null, bodyIndex: i };
    const hit = visit(item.children ?? [], item);
    if (hit) return hit;
  }
  return undefined;
}

/** Finds a group by id with its region. */
export function findGroup(template: ReportTemplate, id: string): { group: Group; region: DataRegion } | undefined {
  const search = (regions: DataRegion[]): ReturnType<typeof findGroup> => {
    for (const r of regions) {
      const group = r.groups?.find((g) => g.id === id);
      if (group) return { group, region: r };
      const hit = search(r.children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  return search(template.body.filter((b): b is DataRegion => b.kind === 'dataRegion'));
}

/** All data regions, depth first. */
export function allRegions(template: ReportTemplate): DataRegion[] {
  const out: DataRegion[] = [];
  const visit = (r: DataRegion) => {
    out.push(r);
    r.children?.forEach(visit);
  };
  template.body.forEach((b) => b.kind === 'dataRegion' && visit(b));
  return out;
}

/**
 * Converts every length in a template to another unit (positions, sizes,
 * band heights, margins, page size, padding, corner radii). Font sizes and
 * border widths are in points and stay unchanged. Mutates the template.
 */
export function convertTemplateUnit(template: ReportTemplate, to: Unit): void {
  const from = template.unit;
  if (from === to) return;
  const c = (v: number) => Math.round(convertUnit(v, from, to) * 1000) / 1000;
  const style = (s: { padding?: unknown } | undefined) => {
    if (!s || s.padding === undefined) return;
    if (typeof s.padding === 'number') s.padding = c(s.padding);
    else {
      const p = s.padding as Record<string, number>;
      for (const k of Object.keys(p)) p[k] = c(p[k]!);
    }
  };
  const band = (b: Band | undefined) => {
    if (!b) return;
    b.height = c(b.height);
    for (const comp of b.components) {
      comp.x = c(comp.x);
      comp.y = c(comp.y);
      comp.width = c(comp.width);
      comp.height = c(comp.height);
      if (comp.type === 'rectangle' && comp.cornerRadius !== undefined) comp.cornerRadius = c(comp.cornerRadius);
      style(comp.style);
      comp.conditions?.forEach((cond) => style(cond.style));
    }
  };
  const m = template.page.margins;
  template.page.margins = { top: c(m.top), right: c(m.right), bottom: c(m.bottom), left: c(m.left) };
  if (typeof template.page.size !== 'string') {
    template.page.size = { width: c(template.page.size.width), height: c(template.page.size.height) };
  }
  for (const s of Object.values(template.styles ?? {})) style(s);
  band(template.reportHeader);
  band(template.pageHeader);
  band(template.pageFooter);
  band(template.reportFooter);
  const region = (r: DataRegion) => {
    band(r.header);
    band(r.detail);
    band(r.footer);
    r.groups?.forEach((g) => {
      band(g.header);
      band(g.footer);
    });
    r.children?.forEach(region);
  };
  for (const item of template.body) {
    if (item.kind === 'band') band(item);
    else region(item);
  }
  template.unit = to;
}
