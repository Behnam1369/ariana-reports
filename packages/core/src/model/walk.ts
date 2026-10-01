import type { Band, DataRegion, ReportComponent, ReportTemplate } from './types';

export type BandRole =
  | 'reportHeader'
  | 'pageHeader'
  | 'pageFooter'
  | 'reportFooter'
  | 'static'
  | 'regionHeader'
  | 'regionFooter'
  | 'groupHeader'
  | 'groupFooter'
  | 'detail';

export interface BandVisit {
  band: Band;
  role: BandRole;
  /** Innermost data region containing the band, if any. */
  region?: DataRegion;
  /** JSON path of the band within the template. */
  path: string;
}

function* walkRegion(region: DataRegion, path: string): Generator<BandVisit> {
  if (region.header) yield { band: region.header, role: 'regionHeader', region, path: `${path}.header` };
  for (const [i, group] of (region.groups ?? []).entries()) {
    if (group.header) {
      yield { band: group.header, role: 'groupHeader', region, path: `${path}.groups[${i}].header` };
    }
  }
  yield { band: region.detail, role: 'detail', region, path: `${path}.detail` };
  for (const [i, child] of (region.children ?? []).entries()) {
    yield* walkRegion(child, `${path}.children[${i}]`);
  }
  for (const [i, group] of [...(region.groups ?? []).entries()].reverse()) {
    if (group.footer) {
      yield { band: group.footer, role: 'groupFooter', region, path: `${path}.groups[${i}].footer` };
    }
  }
  if (region.footer) yield { band: region.footer, role: 'regionFooter', region, path: `${path}.footer` };
}

/** Yields every band in the template in design (top-to-bottom) order. */
export function* walkBands(template: ReportTemplate): Generator<BandVisit> {
  if (template.reportHeader) yield { band: template.reportHeader, role: 'reportHeader', path: 'reportHeader' };
  if (template.pageHeader) yield { band: template.pageHeader, role: 'pageHeader', path: 'pageHeader' };
  for (const [i, item] of template.body.entries()) {
    if (item.kind === 'band') yield { band: item, role: 'static', path: `body[${i}]` };
    else yield* walkRegion(item, `body[${i}]`);
  }
  if (template.pageFooter) yield { band: template.pageFooter, role: 'pageFooter', path: 'pageFooter' };
  if (template.reportFooter) yield { band: template.reportFooter, role: 'reportFooter', path: 'reportFooter' };
}

/** Finds a band by id. */
export function findBand(template: ReportTemplate, id: string): BandVisit | undefined {
  for (const visit of walkBands(template)) if (visit.band.id === id) return visit;
  return undefined;
}

/** Finds a component by id together with the band that contains it. */
export function findComponent(
  template: ReportTemplate,
  id: string,
): { component: ReportComponent; band: BandVisit } | undefined {
  for (const visit of walkBands(template)) {
    const component = visit.band.components.find((c) => c.id === id);
    if (component) return { component, band: visit };
  }
  return undefined;
}
