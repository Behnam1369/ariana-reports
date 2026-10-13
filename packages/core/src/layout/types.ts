import type {
  BorderLineStyle,
  BorderSide,
  FontStyle,
  FontWeight,
  ImageFit,
  TextAlign,
  TextDecoration,
  ValueFormat,
  VerticalAlign,
} from '../model/types';
import type { BandRole } from '../model/walk';
import type { LayoutTextRun } from './html';

export type { LayoutTextRun } from './html';

/**
 * The layout document is the engine's output and the single input of every
 * renderer (DOM viewer, PDF, Excel). All coordinates and sizes are in points
 * (1/72 inch). Item coordinates are relative to the page's top-left corner.
 */
export interface LayoutDocument {
  name: string;
  locale: string;
  /** Page size in points. */
  pageWidth: number;
  pageHeight: number;
  /** Margins in points. */
  margins: { top: number; right: number; bottom: number; left: number };
  pages: LayoutPage[];
  /** Expression errors and layout warnings collected while generating. */
  issues: LayoutIssue[];
}

export interface LayoutPage {
  /** 1-based page number. */
  number: number;
  bands: LayoutBand[];
}

export interface LayoutBand {
  bandId: string;
  role: BandRole;
  /** Data region the band belongs to, if any. */
  regionId?: string;
  /** True for region headers repeated at the top of a continuation page. */
  repeated?: boolean;
  /** Position and size on the page, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
  border?: ResolvedBorder;
  items: LayoutItem[];
}

export interface ResolvedBorder {
  /** Line width in points. */
  width: number;
  color: string;
  style: BorderLineStyle;
  sides: BorderSide[];
}

export interface ResolvedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A style with every property resolved; lengths are in points. */
export interface ResolvedStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  color: string;
  backgroundColor?: string;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  padding: ResolvedPadding;
  border?: ResolvedBorder;
}

interface LayoutItemBase {
  componentId: string;
  /** Position and size on the page, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  style: ResolvedStyle;
}

export interface LayoutText extends LayoutItemBase {
  kind: 'text';
  /** Full text after interpolation and formatting. */
  text: string;
  /** Wrapped lines; renderers must not re-wrap. */
  lines: string[];
  /** Distance between baselines, in points. */
  lineHeight: number;
  /**
   * Raw value when the text is a single `{{ expression }}`, so exporters such
   * as Excel can keep numbers and dates typed. Otherwise equal to `text`.
   */
  value: unknown;
  /** The component's value format, used by exporters for typed cells. */
  format?: ValueFormat;
  /** True when an expression failed and the text shows an error marker. */
  error?: boolean;
  /**
   * Styled runs per wrapped line, present when the component has
   * `allowHtml`. `lines[i]` is the plain text of `runs[i]`.
   */
  runs?: LayoutTextRun[][];
  /** The unwrapped styled runs of `text` (with `allowHtml`), e.g. for Excel rich text. */
  richText?: LayoutTextRun[];
}

export interface LayoutImage extends LayoutItemBase {
  kind: 'image';
  src: string;
  fit: ImageFit;
}

export interface LayoutLine extends LayoutItemBase {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
  color: string;
  lineStyle: BorderLineStyle;
}

export interface LayoutRectangle extends LayoutItemBase {
  kind: 'rectangle';
  cornerRadius: number;
}

export type LayoutItem = LayoutText | LayoutImage | LayoutLine | LayoutRectangle;

export interface LayoutIssue {
  severity: 'error' | 'warning';
  message: string;
  bandId?: string;
  componentId?: string;
  /** The expression that failed, when relevant. */
  expression?: string;
}
