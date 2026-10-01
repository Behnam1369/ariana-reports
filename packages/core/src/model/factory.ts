import {
  SCHEMA_VERSION,
  type Band,
  type ComponentType,
  type DataRegion,
  type ImageComponent,
  type LineComponent,
  type RectangleComponent,
  type ReportComponent,
  type ReportTemplate,
  type StaticBand,
  type TextComponent,
} from './types';

let counter = 0;

/** Returns an id that is unique within this runtime, e.g. `text_lq3k2x_7`. */
export function generateId(prefix = 'item'): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** A minimal valid template: A4 portrait, millimetres, one empty static band. */
export function createTemplate(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'Untitled report',
    unit: 'mm',
    locale: 'en-US',
    page: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    dataSources: [],
    styles: {},
    body: [],
    ...overrides,
  };
}

export function createBand(overrides: Partial<Band> = {}): Band {
  return { id: generateId('band'), height: 10, components: [], ...overrides };
}

export function createStaticBand(overrides: Partial<Omit<StaticBand, 'kind'>> = {}): StaticBand {
  return { ...createBand(overrides), kind: 'band' };
}

export function createDataRegion(dataSource: string, overrides: Partial<DataRegion> = {}): DataRegion {
  return {
    kind: 'dataRegion',
    id: generateId('region'),
    dataSource,
    detail: createBand(),
    ...overrides,
  };
}

type ComponentOf<T extends ComponentType> = Extract<ReportComponent, { type: T }>;

/** Creates a component of the given type with sensible defaults. */
export function createComponent<T extends ComponentType>(
  type: T,
  overrides: Partial<ComponentOf<T>> = {},
): ComponentOf<T> {
  const base = { id: generateId(type), x: 0, y: 0, width: 40, height: 6 };
  let component: ReportComponent;
  switch (type) {
    case 'text':
      component = { ...base, type: 'text', text: 'Text' } satisfies TextComponent;
      break;
    case 'image':
      component = { ...base, type: 'image', src: '', fit: 'contain', height: 20 } satisfies ImageComponent;
      break;
    case 'line':
      component = { ...base, type: 'line', orientation: 'horizontal', height: 0 } satisfies LineComponent;
      break;
    case 'rectangle':
      component = { ...base, type: 'rectangle', height: 20 } satisfies RectangleComponent;
      break;
    default:
      throw new Error(`Unknown component type: ${String(type)}`);
  }
  return { ...component, ...overrides } as ComponentOf<T>;
}

/** Deep-clones a JSON-compatible value (templates are plain JSON). */
export function cloneTemplate<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
