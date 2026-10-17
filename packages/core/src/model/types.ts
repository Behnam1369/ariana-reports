/**
 * ariana-report template model.
 *
 * A template is a plain JSON document. All positions and sizes are expressed in
 * the template's `unit`, except font sizes which are always in points.
 *
 * Layout is banded:
 *  - page-level bands: reportHeader, pageHeader, pageFooter, reportFooter
 *  - body: a sequence of static bands and data regions
 *  - a data region iterates rows of a JSON data source and has an optional
 *    header, groups (each with header/footer), a detail band, a footer and
 *    nested child regions (master-detail).
 */

export const SCHEMA_VERSION = 1 as const;

export const UNITS = ['mm', 'cm', 'in', 'pt', 'px'] as const;
export type Unit = (typeof UNITS)[number];

export const PAPER_SIZE_NAMES = ['A3', 'A4', 'A5', 'Letter', 'Legal'] as const;
export type PaperSize = (typeof PAPER_SIZE_NAMES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CustomPageSize {
  width: number;
  height: number;
}

export interface PageSettings {
  /** Named paper size, or a custom size in template units (portrait dimensions). */
  size: PaperSize | CustomPageSize;
  orientation: Orientation;
  margins: Margins;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'object', 'array', 'unknown'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDefinition {
  name: string;
  type: FieldType;
  /** Nested fields for `object` fields and arrays of objects. */
  fields?: FieldDefinition[];
}

export interface DataSourceDefinition {
  /** Identifier used in expressions. Must be a valid JavaScript identifier. */
  name: string;
  /** Dot path into the report data object. Defaults to `name`. */
  path?: string;
  /** Optional field schema, used by the designer for field binding. */
  fields?: FieldDefinition[];
}

export interface ParameterDefinition {
  /** Identifier used in expressions as `params.<name>`. */
  name: string;
  type: FieldType;
  label?: string;
  defaultValue?: unknown;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const FONT_WEIGHTS = ['normal', 'bold'] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

export const FONT_STYLES = ['normal', 'italic'] as const;
export type FontStyle = (typeof FONT_STYLES)[number];

export const TEXT_DECORATIONS = ['none', 'underline', 'line-through'] as const;
export type TextDecoration = (typeof TEXT_DECORATIONS)[number];

export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const VERTICAL_ALIGNS = ['top', 'middle', 'bottom'] as const;
export type VerticalAlign = (typeof VERTICAL_ALIGNS)[number];

/**
 * Base direction of text. `auto` follows the first strong character, so a
 * text starting with a Persian or Arabic letter is right-to-left.
 */
export const TEXT_DIRECTIONS = ['auto', 'ltr', 'rtl'] as const;
export type TextDirection = (typeof TEXT_DIRECTIONS)[number];

export const BORDER_LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type BorderLineStyle = (typeof BORDER_LINE_STYLES)[number];

export const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

export interface BorderSpec {
  /** Line width in points. */
  width: number;
  color: string;
  style: BorderLineStyle;
  /** Sides to draw. Defaults to all four. */
  sides?: BorderSide[];
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface StyleProps {
  fontFamily?: string;
  /** Font size in points. */
  fontSize?: number;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  textDecoration?: TextDecoration;
  color?: string;
  backgroundColor?: string;
  textAlign?: TextAlign;
  verticalAlign?: VerticalAlign;
  /**
   * Base text direction: `ltr`, `rtl` or `auto` (the default, decided by the
   * first strong character). Right-to-left text is right-aligned unless
   * `textAlign` is set.
   */
  direction?: TextDirection;
  /** Padding in template units: one value for all sides, or per side. */
  padding?: number | Padding;
  border?: BorderSpec;
}

export const STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'color',
  'backgroundColor',
  'textAlign',
  'verticalAlign',
  'direction',
  'padding',
  'border',
] as const satisfies readonly (keyof StyleProps)[];

/** Style applied on top of the component style when `expression` is truthy. */
export interface ConditionalStyle {
  expression: string;
  style: StyleProps;
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

export const FORMAT_TYPES = ['number', 'currency', 'percent', 'date'] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

export interface NumberFormat {
  type: 'number';
  decimals?: number;
  thousandsSeparator?: boolean;
  prefix?: string;
  suffix?: string;
}

export interface CurrencyFormat {
  type: 'currency';
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  decimals?: number;
}

export interface PercentFormat {
  type: 'percent';
  decimals?: number;
}

export const CALENDARS = ['gregory', 'persian', 'islamic', 'islamic-umalqura', 'hebrew', 'buddhist', 'japanese', 'roc'] as const;
export type Calendar = (typeof CALENDARS)[number];

export interface DateFormat {
  type: 'date';
  /** Pattern such as "yyyy-MM-dd" or "dd/MM/yyyy HH:mm". */
  pattern: string;
  /**
   * Calendar used for the year, month and day tokens. Defaults to the Gregorian
   * calendar. `persian` writes Jalali dates, e.g. 1405/07/21. Month names follow
   * the report locale. Excel exports such dates as text.
   */
  calendar?: Calendar;
}

export type ValueFormat = NumberFormat | CurrencyFormat | PercentFormat | DateFormat;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const COMPONENT_TYPES = ['text', 'image', 'line', 'rectangle'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export interface ComponentBase {
  /** Unique within the template. */
  id: string;
  type: ComponentType;
  /** Optional display name for the designer. */
  name?: string;
  /** Position relative to the band's top-left corner, in template units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Name of a style in `template.styles`. */
  styleName?: string;
  /** Inline style, applied over the named style. */
  style?: StyleProps;
  conditions?: ConditionalStyle[];
  /** JavaScript expression; the component is hidden when it evaluates falsy. */
  visible?: string;
  /**
   * Stretch the component down to the bottom of its band once the band height
   * is known, e.g. so bordered table cells line up when a neighbour grows.
   */
  growToHeight?: boolean;
}

export interface TextComponent extends ComponentBase {
  type: 'text';
  /** Text with `{{ expression }}` placeholders. */
  text: string;
  /** Format applied to every interpolated value. */
  format?: ValueFormat;
  /** Grow height to fit the content. */
  canGrow?: boolean;
  /** Wrap long lines. Defaults to true. */
  wordWrap?: boolean;
  /**
   * Interpret a safe subset of HTML formatting tags in the text (after
   * interpolation): <b>, <i>, <u>, <s>, <br>, <font color>, <span style>.
   * Other tags are removed; markup is never inserted as HTML. Defaults to false.
   */
  allowHtml?: boolean;
}

export const IMAGE_FITS = ['contain', 'cover', 'fill', 'none'] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

export interface ImageComponent extends ComponentBase {
  type: 'image';
  /** URL or data URI. May contain `{{ expression }}` placeholders. */
  src: string;
  fit?: ImageFit;
}

export const LINE_ORIENTATIONS = ['horizontal', 'vertical'] as const;
export type LineOrientation = (typeof LINE_ORIENTATIONS)[number];

export interface LineComponent extends ComponentBase {
  type: 'line';
  orientation: LineOrientation;
}

export interface RectangleComponent extends ComponentBase {
  type: 'rectangle';
  /** Corner radius in template units. */
  cornerRadius?: number;
}

export type ReportComponent = TextComponent | ImageComponent | LineComponent | RectangleComponent;

// ---------------------------------------------------------------------------
// Bands and regions
// ---------------------------------------------------------------------------

export interface Band {
  /** Unique within the template. */
  id: string;
  /** Height in template units. */
  height: number;
  components: ReportComponent[];
  /** Grow to fit components that grow. Defaults to true. Ignored for page header/footer. */
  canGrow?: boolean;
  /** Shrink to the bottom of the visible components. Defaults to false. */
  canShrink?: boolean;
  /** JavaScript expression; the band is skipped when it evaluates falsy. */
  visible?: string;
  /**
   * Reserved: bands are never split across pages in v1; a band that does not
   * fit moves to the next page.
   */
  keepTogether?: boolean;
  pageBreakBefore?: boolean;
  pageBreakAfter?: boolean;
  /** Only `backgroundColor` and `border` apply to bands. */
  style?: StyleProps;
  /** Page header/footer only. Defaults to true. */
  printOnFirstPage?: boolean;
  /** Page header/footer only. Defaults to true. */
  printOnLastPage?: boolean;
  /**
   * Color of the band's caption on the design surface (the band area uses a
   * lighter tint). Design time only: it does not affect the report.
   */
  designColor?: string;
}

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface SortRule {
  /** Expression evaluated per row. */
  expression: string;
  direction: SortDirection;
}

export const GROUP_SORT_DIRECTIONS = ['asc', 'desc', 'none'] as const;
export type GroupSortDirection = (typeof GROUP_SORT_DIRECTIONS)[number];

export interface Group {
  id: string;
  /** Expression evaluated per row; consecutive equal values form a group. */
  expression: string;
  /** Sort rows by the group key before grouping. Defaults to "asc". */
  sortDirection?: GroupSortDirection;
  header?: Band;
  footer?: Band;
  /** Start each group (after the first) on a new page. */
  pageBreakBefore?: boolean;
}

export interface DataRegion {
  kind: 'dataRegion';
  id: string;
  /** Named data source. Required for top-level regions. */
  dataSource?: string;
  /** Child regions only: dot path to an array field of the parent row. */
  relation?: string;
  /** Expression evaluated per row; rows where it is falsy are skipped. */
  filter?: string;
  sort?: SortRule[];
  header?: Band;
  /** Repeat the header band at the top of each new page. */
  repeatHeaderOnEachPage?: boolean;
  /** Outermost group first. */
  groups?: Group[];
  detail: Band;
  footer?: Band;
  /** Nested regions rendered after each detail row. */
  children?: DataRegion[];
}

export interface StaticBand extends Band {
  kind: 'band';
}

export type BodyItem = StaticBand | DataRegion;

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export interface ReportTemplate {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  description?: string;
  unit: Unit;
  /** BCP 47 locale for number and date formatting. Defaults to "en-US". */
  locale?: string;
  page: PageSettings;
  dataSources: DataSourceDefinition[];
  parameters?: ParameterDefinition[];
  /** Named, reusable styles. */
  styles?: Record<string, StyleProps>;
  reportHeader?: Band;
  pageHeader?: Band;
  pageFooter?: Band;
  reportFooter?: Band;
  body: BodyItem[];
}
