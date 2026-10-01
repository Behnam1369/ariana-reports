import {
  BORDER_LINE_STYLES,
  BORDER_SIDES,
  COMPONENT_TYPES,
  FIELD_TYPES,
  FONT_STYLES,
  FONT_WEIGHTS,
  GROUP_SORT_DIRECTIONS,
  IMAGE_FITS,
  LINE_ORIENTATIONS,
  ORIENTATIONS,
  PAPER_SIZE_NAMES,
  SCHEMA_VERSION,
  SORT_DIRECTIONS,
  STYLE_KEYS,
  TEXT_ALIGNS,
  TEXT_DECORATIONS,
  UNITS,
  VERTICAL_ALIGNS,
  type ReportTemplate,
} from './types';
import { checkExpression as defaultCheckExpression } from '../expressions';
import { splitPlaceholders } from '../expressions/text';

export interface ValidationIssue {
  /** JSON path to the offending value, e.g. `body[0].detail.components[2].x`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}

export class TemplateValidationError extends Error {
  readonly errors: ValidationIssue[];

  constructor(errors: ValidationIssue[]) {
    const preview = errors
      .slice(0, 5)
      .map((e) => `${e.path || '<root>'}: ${e.message}`)
      .join('; ');
    const more = errors.length > 5 ? ` (and ${errors.length - 5} more)` : '';
    super(`Invalid report template: ${preview}${more}`);
    this.name = 'TemplateValidationError';
    this.errors = errors;
  }
}

/** Returns null for a valid expression, otherwise an error message. */
export type ExpressionChecker = (source: string) => string | null;

export interface ValidateOptions {
  /**
   * Checks expression syntax. Defaults to the built-in JavaScript expression
   * parser; pass `false` to skip expression checks.
   */
  checkExpression?: ExpressionChecker | false;
}

type Obj = Record<string, unknown>;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DOT_PATH = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const COLOR = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/;
const RESERVED_NAMES = new Set(['params', 'row', 'page', 'report', 'group', 'parent', 'globals']);

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function join(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

class Validator {
  readonly errors: ValidationIssue[] = [];
  private readonly ids = new Map<string, string>();
  private dataSourceNames = new Set<string>();
  private styleNames = new Set<string>();

  private readonly checker: ExpressionChecker | null;

  constructor(options: ValidateOptions) {
    this.checker =
      options.checkExpression === false ? null : (options.checkExpression ?? defaultCheckExpression);
  }

  error(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  // -- primitives ----------------------------------------------------------

  requireObject(value: unknown, path: string): value is Obj {
    if (!isObj(value)) {
      this.error(path, 'must be an object');
      return false;
    }
    return true;
  }

  requireString(o: Obj, key: string, path: string, optional = false): string | undefined {
    const v = o[key];
    if (v === undefined && optional) return undefined;
    if (typeof v !== 'string') {
      this.error(join(path, key), 'must be a string');
      return undefined;
    }
    return v;
  }

  requireNonEmptyString(o: Obj, key: string, path: string, optional = false): string | undefined {
    const v = this.requireString(o, key, path, optional);
    if (v !== undefined && v.trim() === '') {
      this.error(join(path, key), 'must not be empty');
      return undefined;
    }
    return v;
  }

  requireNumber(
    o: Obj,
    key: string,
    path: string,
    opts: { optional?: boolean; min?: number; exclusiveMin?: boolean; integer?: boolean } = {},
  ): number | undefined {
    const v = o[key];
    if (v === undefined && opts.optional) return undefined;
    if (!isFiniteNumber(v)) {
      this.error(join(path, key), 'must be a finite number');
      return undefined;
    }
    if (opts.integer && !Number.isInteger(v)) {
      this.error(join(path, key), 'must be an integer');
    }
    if (opts.min !== undefined) {
      if (opts.exclusiveMin ? v <= opts.min : v < opts.min) {
        this.error(join(path, key), `must be ${opts.exclusiveMin ? 'greater than' : 'at least'} ${opts.min}`);
      }
    }
    return v;
  }

  optionalBoolean(o: Obj, key: string, path: string): void {
    const v = o[key];
    if (v !== undefined && typeof v !== 'boolean') this.error(join(path, key), 'must be a boolean');
  }

  requireEnum<T extends string>(
    o: Obj,
    key: string,
    values: readonly T[],
    path: string,
    optional = false,
  ): T | undefined {
    const v = o[key];
    if (v === undefined && optional) return undefined;
    if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
      this.error(join(path, key), `must be one of: ${values.join(', ')}`);
      return undefined;
    }
    return v as T;
  }

  requireArray(o: Obj, key: string, path: string, optional = false): unknown[] | undefined {
    const v = o[key];
    if (v === undefined && optional) return undefined;
    if (!Array.isArray(v)) {
      this.error(join(path, key), 'must be an array');
      return undefined;
    }
    return v;
  }

  color(o: Obj, key: string, path: string): void {
    const v = o[key];
    if (v === undefined) return;
    if (typeof v !== 'string' || !COLOR.test(v.trim())) {
      this.error(join(path, key), 'must be a color: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba() or "transparent"');
    }
  }

  expression(o: Obj, key: string, path: string, optional = true): void {
    const v = this.requireNonEmptyString(o, key, path, optional);
    if (v === undefined || !this.checker) return;
    const problem = this.checker(v);
    if (problem) this.error(join(path, key), `invalid expression: ${problem}`);
  }

  /** Validates `{{ expression }}` placeholders inside a text template. */
  interpolated(o: Obj, key: string, path: string): void {
    const v = this.requireString(o, key, path);
    if (v === undefined) return;
    const segments = scanPlaceholders(v);
    if (typeof segments === 'string') {
      this.error(join(path, key), segments);
      return;
    }
    if (!this.checker) return;
    for (const expr of segments) {
      const problem = this.checker(expr);
      if (problem) this.error(join(path, key), `invalid expression "${expr}": ${problem}`);
    }
  }

  uniqueId(o: Obj, path: string): void {
    const id = this.requireNonEmptyString(o, 'id', path);
    if (id === undefined) return;
    const first = this.ids.get(id);
    if (first !== undefined) {
      this.error(join(path, 'id'), `duplicate id "${id}" (first used at ${first})`);
    } else {
      this.ids.set(id, join(path, 'id'));
    }
  }

  noUnknownKeys(o: Obj, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(o)) {
      if (!allowed.includes(key)) this.error(join(path, key), 'unknown property');
    }
  }

  // -- template ------------------------------------------------------------

  template(t: unknown): void {
    if (!this.requireObject(t, '')) return;

    this.noUnknownKeys(
      t,
      [
        'schemaVersion',
        'name',
        'description',
        'unit',
        'locale',
        'page',
        'dataSources',
        'parameters',
        'styles',
        'reportHeader',
        'pageHeader',
        'pageFooter',
        'reportFooter',
        'body',
      ],
      '',
    );

    if (t.schemaVersion !== SCHEMA_VERSION) {
      this.error('schemaVersion', `must be ${SCHEMA_VERSION}`);
    }
    this.requireNonEmptyString(t, 'name', '');
    this.requireString(t, 'description', '', true);
    this.requireEnum(t, 'unit', UNITS, '');
    if (t.locale !== undefined) {
      const locale = this.requireNonEmptyString(t, 'locale', '');
      if (locale !== undefined && !isValidLocale(locale)) this.error('locale', 'must be a valid BCP 47 locale');
    }

    this.page(t.page, 'page');

    // Collect names first so references can be checked in any order.
    const dataSources = this.requireArray(t, 'dataSources', '');
    dataSources?.forEach((ds, i) => this.dataSource(ds, join('dataSources', i)));

    const params = this.requireArray(t, 'parameters', '', true);
    const paramNames = new Set<string>();
    params?.forEach((p, i) => this.parameter(p, join('parameters', i), paramNames));

    if (t.styles !== undefined) {
      if (this.requireObject(t.styles, 'styles')) {
        for (const [name, style] of Object.entries(t.styles)) {
          this.styleNames.add(name);
          this.style(style, join('styles', name));
        }
      }
    }

    for (const key of ['reportHeader', 'pageHeader', 'pageFooter', 'reportFooter'] as const) {
      if (t[key] !== undefined) this.band(t[key], key, { pageBand: key === 'pageHeader' || key === 'pageFooter' });
    }

    const body = this.requireArray(t, 'body', '');
    body?.forEach((item, i) => this.bodyItem(item, join('body', i)));
  }

  page(p: unknown, path: string): void {
    if (!this.requireObject(p, path)) return;
    this.noUnknownKeys(p, ['size', 'orientation', 'margins'], path);

    const size = p.size;
    if (typeof size === 'string') {
      if (!(PAPER_SIZE_NAMES as readonly string[]).includes(size)) {
        this.error(join(path, 'size'), `must be one of: ${PAPER_SIZE_NAMES.join(', ')}, or { width, height }`);
      }
    } else if (isObj(size)) {
      this.noUnknownKeys(size, ['width', 'height'], join(path, 'size'));
      this.requireNumber(size, 'width', join(path, 'size'), { min: 0, exclusiveMin: true });
      this.requireNumber(size, 'height', join(path, 'size'), { min: 0, exclusiveMin: true });
    } else {
      this.error(join(path, 'size'), 'must be a paper size name or { width, height }');
    }

    this.requireEnum(p, 'orientation', ORIENTATIONS, path);

    const mPath = join(path, 'margins');
    if (this.requireObject(p.margins, mPath)) {
      this.noUnknownKeys(p.margins, ['top', 'right', 'bottom', 'left'], mPath);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        this.requireNumber(p.margins, side, mPath, { min: 0 });
      }
    }
  }

  dataSource(ds: unknown, path: string): void {
    if (!this.requireObject(ds, path)) return;
    this.noUnknownKeys(ds, ['name', 'path', 'fields'], path);
    const name = this.requireNonEmptyString(ds, 'name', path);
    if (name !== undefined) {
      if (!IDENTIFIER.test(name)) {
        this.error(join(path, 'name'), 'must be a valid JavaScript identifier');
      } else if (RESERVED_NAMES.has(name)) {
        this.error(join(path, 'name'), `"${name}" is reserved`);
      } else if (this.dataSourceNames.has(name)) {
        this.error(join(path, 'name'), `duplicate data source name "${name}"`);
      } else {
        this.dataSourceNames.add(name);
      }
    }
    const dsPath = this.requireNonEmptyString(ds, 'path', path, true);
    if (dsPath !== undefined && !DOT_PATH.test(dsPath)) {
      this.error(join(path, 'path'), 'must be a dot-separated path of identifiers');
    }
    const fields = this.requireArray(ds, 'fields', path, true);
    if (fields) this.fields(fields, join(path, 'fields'));
  }

  fields(fields: unknown[], path: string): void {
    const names = new Set<string>();
    fields.forEach((f, i) => {
      const fPath = join(path, i);
      if (!this.requireObject(f, fPath)) return;
      this.noUnknownKeys(f, ['name', 'type', 'fields'], fPath);
      const name = this.requireNonEmptyString(f, 'name', fPath);
      if (name !== undefined) {
        if (names.has(name)) this.error(join(fPath, 'name'), `duplicate field name "${name}"`);
        names.add(name);
      }
      this.requireEnum(f, 'type', FIELD_TYPES, fPath);
      const nested = this.requireArray(f, 'fields', fPath, true);
      if (nested) this.fields(nested, join(fPath, 'fields'));
    });
  }

  parameter(p: unknown, path: string, names: Set<string>): void {
    if (!this.requireObject(p, path)) return;
    this.noUnknownKeys(p, ['name', 'type', 'label', 'defaultValue'], path);
    const name = this.requireNonEmptyString(p, 'name', path);
    if (name !== undefined) {
      if (!IDENTIFIER.test(name)) this.error(join(path, 'name'), 'must be a valid JavaScript identifier');
      else if (names.has(name)) this.error(join(path, 'name'), `duplicate parameter name "${name}"`);
      names.add(name);
    }
    this.requireEnum(p, 'type', FIELD_TYPES, path);
    this.requireString(p, 'label', path, true);
  }

  style(s: unknown, path: string): void {
    if (!this.requireObject(s, path)) return;
    this.noUnknownKeys(s, STYLE_KEYS, path);
    this.requireString(s, 'fontFamily', path, true);
    this.requireNumber(s, 'fontSize', path, { optional: true, min: 0, exclusiveMin: true });
    this.requireEnum(s, 'fontWeight', FONT_WEIGHTS, path, true);
    this.requireEnum(s, 'fontStyle', FONT_STYLES, path, true);
    this.requireEnum(s, 'textDecoration', TEXT_DECORATIONS, path, true);
    this.color(s, 'color', path);
    this.color(s, 'backgroundColor', path);
    this.requireEnum(s, 'textAlign', TEXT_ALIGNS, path, true);
    this.requireEnum(s, 'verticalAlign', VERTICAL_ALIGNS, path, true);

    if (s.padding !== undefined) {
      const pPath = join(path, 'padding');
      if (isFiniteNumber(s.padding)) {
        if (s.padding < 0) this.error(pPath, 'must be at least 0');
      } else if (isObj(s.padding)) {
        this.noUnknownKeys(s.padding, ['top', 'right', 'bottom', 'left'], pPath);
        for (const side of ['top', 'right', 'bottom', 'left']) {
          this.requireNumber(s.padding, side, pPath, { min: 0 });
        }
      } else {
        this.error(pPath, 'must be a number or { top, right, bottom, left }');
      }
    }

    if (s.border !== undefined) {
      const bPath = join(path, 'border');
      if (this.requireObject(s.border, bPath)) {
        const b = s.border;
        this.noUnknownKeys(b, ['width', 'color', 'style', 'sides'], bPath);
        this.requireNumber(b, 'width', bPath, { min: 0 });
        this.requireString(b, 'color', bPath);
        this.color(b, 'color', bPath);
        this.requireEnum(b, 'style', BORDER_LINE_STYLES, bPath);
        const sides = this.requireArray(b, 'sides', bPath, true);
        sides?.forEach((side, i) => {
          if (typeof side !== 'string' || !(BORDER_SIDES as readonly string[]).includes(side)) {
            this.error(join(join(bPath, 'sides'), i), `must be one of: ${BORDER_SIDES.join(', ')}`);
          }
        });
      }
    }
  }

  // -- bands ---------------------------------------------------------------

  band(b: unknown, path: string, opts: { pageBand?: boolean; kind?: boolean } = {}): void {
    if (!this.requireObject(b, path)) return;
    const allowed = [
      'id',
      'height',
      'components',
      'canGrow',
      'canShrink',
      'visible',
      'keepTogether',
      'pageBreakBefore',
      'pageBreakAfter',
      'style',
    ];
    if (opts.pageBand) allowed.push('printOnFirstPage', 'printOnLastPage');
    if (opts.kind) allowed.push('kind');
    this.noUnknownKeys(b, allowed, path);

    this.uniqueId(b, path);
    this.requireNumber(b, 'height', path, { min: 0 });
    for (const key of ['canGrow', 'canShrink', 'keepTogether', 'pageBreakBefore', 'pageBreakAfter']) {
      this.optionalBoolean(b, key, path);
    }
    if (opts.pageBand) {
      this.optionalBoolean(b, 'printOnFirstPage', path);
      this.optionalBoolean(b, 'printOnLastPage', path);
    }
    this.expression(b, 'visible', path);

    if (b.style !== undefined) {
      const sPath = join(path, 'style');
      this.style(b.style, sPath);
      if (isObj(b.style)) {
        for (const key of Object.keys(b.style)) {
          if (key !== 'backgroundColor' && key !== 'border' && (STYLE_KEYS as readonly string[]).includes(key)) {
            this.error(join(sPath, key), 'only backgroundColor and border apply to bands');
          }
        }
      }
    }

    const components = this.requireArray(b, 'components', path);
    components?.forEach((c, i) => this.component(c, join(join(path, 'components'), i)));
  }

  bodyItem(item: unknown, path: string): void {
    if (!this.requireObject(item, path)) return;
    if (item.kind === 'band') {
      this.band(item, path, { kind: true });
    } else if (item.kind === 'dataRegion') {
      this.dataRegion(item, path, false);
    } else {
      this.error(join(path, 'kind'), 'must be "band" or "dataRegion"');
    }
  }

  dataRegion(r: unknown, path: string, isChild: boolean): void {
    if (!this.requireObject(r, path)) return;
    this.noUnknownKeys(
      r,
      [
        'kind',
        'id',
        'dataSource',
        'relation',
        'filter',
        'sort',
        'header',
        'repeatHeaderOnEachPage',
        'groups',
        'detail',
        'footer',
        'children',
      ],
      path,
    );
    if (r.kind !== 'dataRegion') this.error(join(path, 'kind'), 'must be "dataRegion"');
    this.uniqueId(r, path);

    if (isChild) {
      if (r.dataSource !== undefined && r.relation !== undefined) {
        this.error(path, 'a child region must set either dataSource or relation, not both');
      } else if (r.dataSource === undefined && r.relation === undefined) {
        this.error(path, 'a child region must set dataSource or relation');
      }
    } else {
      if (r.relation !== undefined) this.error(join(path, 'relation'), 'only child regions may use relation');
      if (r.dataSource === undefined) this.error(join(path, 'dataSource'), 'is required');
    }

    if (r.dataSource !== undefined) {
      const ds = this.requireNonEmptyString(r, 'dataSource', path);
      if (ds !== undefined && !this.dataSourceNames.has(ds)) {
        this.error(join(path, 'dataSource'), `unknown data source "${ds}"`);
      }
    }
    if (r.relation !== undefined) {
      const rel = this.requireNonEmptyString(r, 'relation', path);
      if (rel !== undefined && !DOT_PATH.test(rel)) {
        this.error(join(path, 'relation'), 'must be a dot-separated path of identifiers');
      }
    }

    this.expression(r, 'filter', path);
    this.optionalBoolean(r, 'repeatHeaderOnEachPage', path);

    const sort = this.requireArray(r, 'sort', path, true);
    sort?.forEach((rule, i) => {
      const sPath = join(join(path, 'sort'), i);
      if (!this.requireObject(rule, sPath)) return;
      this.noUnknownKeys(rule, ['expression', 'direction'], sPath);
      this.expression(rule, 'expression', sPath, false);
      this.requireEnum(rule, 'direction', SORT_DIRECTIONS, sPath);
    });

    if (r.header !== undefined) this.band(r.header, join(path, 'header'));

    const groups = this.requireArray(r, 'groups', path, true);
    groups?.forEach((g, i) => {
      const gPath = join(join(path, 'groups'), i);
      if (!this.requireObject(g, gPath)) return;
      this.noUnknownKeys(g, ['id', 'expression', 'sortDirection', 'header', 'footer', 'pageBreakBefore'], gPath);
      this.uniqueId(g, gPath);
      this.expression(g, 'expression', gPath, false);
      this.requireEnum(g, 'sortDirection', GROUP_SORT_DIRECTIONS, gPath, true);
      this.optionalBoolean(g, 'pageBreakBefore', gPath);
      if (g.header !== undefined) this.band(g.header, join(gPath, 'header'));
      if (g.footer !== undefined) this.band(g.footer, join(gPath, 'footer'));
    });

    if (r.detail === undefined) this.error(join(path, 'detail'), 'is required');
    else this.band(r.detail, join(path, 'detail'));

    if (r.footer !== undefined) this.band(r.footer, join(path, 'footer'));

    const children = this.requireArray(r, 'children', path, true);
    children?.forEach((c, i) => this.dataRegion(c, join(join(path, 'children'), i), true));
  }

  // -- components ----------------------------------------------------------

  component(c: unknown, path: string): void {
    if (!this.requireObject(c, path)) return;
    const type = this.requireEnum(c, 'type', COMPONENT_TYPES, path);
    const base = ['id', 'type', 'name', 'x', 'y', 'width', 'height', 'styleName', 'style', 'conditions', 'visible'];
    const extra: Record<string, string[]> = {
      text: ['text', 'format', 'canGrow', 'wordWrap'],
      image: ['src', 'fit'],
      line: ['orientation'],
      rectangle: ['cornerRadius'],
    };
    if (type) this.noUnknownKeys(c, [...base, ...(extra[type] ?? [])], path);

    this.uniqueId(c, path);
    this.requireString(c, 'name', path, true);
    this.requireNumber(c, 'x', path, { min: 0 });
    this.requireNumber(c, 'y', path, { min: 0 });
    this.requireNumber(c, 'width', path, { min: 0 });
    this.requireNumber(c, 'height', path, { min: 0 });

    if (c.styleName !== undefined) {
      const name = this.requireNonEmptyString(c, 'styleName', path);
      if (name !== undefined && !this.styleNames.has(name)) {
        this.error(join(path, 'styleName'), `unknown style "${name}"`);
      }
    }
    if (c.style !== undefined) this.style(c.style, join(path, 'style'));
    this.expression(c, 'visible', path);

    const conditions = this.requireArray(c, 'conditions', path, true);
    conditions?.forEach((cond, i) => {
      const cPath = join(join(path, 'conditions'), i);
      if (!this.requireObject(cond, cPath)) return;
      this.noUnknownKeys(cond, ['expression', 'style'], cPath);
      this.expression(cond, 'expression', cPath, false);
      if (cond.style === undefined) this.error(join(cPath, 'style'), 'is required');
      else this.style(cond.style, join(cPath, 'style'));
    });

    switch (type) {
      case 'text':
        this.interpolated(c, 'text', path);
        if (c.format !== undefined) this.format(c.format, join(path, 'format'));
        this.optionalBoolean(c, 'canGrow', path);
        this.optionalBoolean(c, 'wordWrap', path);
        break;
      case 'image':
        this.interpolated(c, 'src', path);
        this.requireEnum(c, 'fit', IMAGE_FITS, path, true);
        break;
      case 'line':
        this.requireEnum(c, 'orientation', LINE_ORIENTATIONS, path);
        break;
      case 'rectangle':
        this.requireNumber(c, 'cornerRadius', path, { optional: true, min: 0 });
        break;
      default:
        break;
    }
  }

  format(f: unknown, path: string): void {
    if (!this.requireObject(f, path)) return;
    switch (f.type) {
      case 'number':
        this.noUnknownKeys(f, ['type', 'decimals', 'thousandsSeparator', 'prefix', 'suffix'], path);
        this.requireNumber(f, 'decimals', path, { optional: true, min: 0, integer: true });
        this.optionalBoolean(f, 'thousandsSeparator', path);
        this.requireString(f, 'prefix', path, true);
        this.requireString(f, 'suffix', path, true);
        break;
      case 'currency': {
        this.noUnknownKeys(f, ['type', 'currency', 'decimals'], path);
        const code = this.requireString(f, 'currency', path);
        if (code !== undefined && !/^[A-Z]{3}$/.test(code)) {
          this.error(join(path, 'currency'), 'must be a 3-letter ISO 4217 code');
        }
        this.requireNumber(f, 'decimals', path, { optional: true, min: 0, integer: true });
        break;
      }
      case 'percent':
        this.noUnknownKeys(f, ['type', 'decimals'], path);
        this.requireNumber(f, 'decimals', path, { optional: true, min: 0, integer: true });
        break;
      case 'date':
        this.noUnknownKeys(f, ['type', 'pattern'], path);
        this.requireNonEmptyString(f, 'pattern', path);
        break;
      default:
        this.error(join(path, 'type'), 'must be one of: number, currency, percent, date');
    }
  }
}

/**
 * Splits text on `{{ ... }}` placeholders and returns the expression sources,
 * or an error message when a placeholder is unterminated or empty.
 * `{{` can be written literally as `\{{`.
 */
export function scanPlaceholders(text: string): string[] | string {
  try {
    return splitPlaceholders(text).flatMap((p) => (p.kind === 'expression' ? [p.source] : []));
  } catch (err) {
    return (err as Error).message;
  }
}

function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

/** Validates an unknown value against the template schema. Never throws. */
export function validateTemplate(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const v = new Validator(options);
  v.template(input);
  return { valid: v.errors.length === 0, errors: v.errors };
}

/**
 * Parses a template from a JSON string or an already-parsed value.
 * Throws `TemplateValidationError` when the template is invalid.
 */
export function parseTemplate(input: string | unknown, options: ValidateOptions = {}): ReportTemplate {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (err) {
      throw new TemplateValidationError([
        { path: '', message: `not valid JSON: ${(err as Error).message}` },
      ]);
    }
  }
  const result = validateTemplate(value, options);
  if (!result.valid) throw new TemplateValidationError(result.errors);
  return value as ReportTemplate;
}
