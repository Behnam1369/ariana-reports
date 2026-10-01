import { describe, expect, it } from 'vitest';
import {
  cloneTemplate,
  COMPONENT_TYPES,
  createBand,
  createComponent,
  createDataRegion,
  createStaticBand,
  createTemplate,
  findBand,
  findComponent,
  generateId,
  validateTemplate,
  walkBands,
} from '../../src/model';
import { invoiceTemplate } from '../fixtures/invoice';

describe('factories', () => {
  it('generateId returns unique, prefixed ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId('text')));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^text_/);
  });

  it('createTemplate applies overrides', () => {
    const t = createTemplate({ name: 'Mine', unit: 'in' });
    expect(t.name).toBe('Mine');
    expect(t.unit).toBe('in');
    expect(t.schemaVersion).toBe(1);
  });

  it.each(COMPONENT_TYPES)('createComponent("%s") yields a valid component', (type) => {
    const component = createComponent(type);
    expect(component.type).toBe(type);
    const template = createTemplate({ body: [createStaticBand({ components: [component] })] });
    expect(validateTemplate(template).errors).toEqual([]);
  });

  it('createComponent applies overrides', () => {
    const text = createComponent('text', { text: '{{ row.name }}', x: 5 });
    expect(text.text).toBe('{{ row.name }}');
    expect(text.x).toBe(5);
  });

  it('createComponent rejects unknown types', () => {
    expect(() => createComponent('chart' as never)).toThrow(/Unknown component type/);
  });

  it('builds a valid template from all factories', () => {
    const template = createTemplate({
      dataSources: [{ name: 'people' }],
      reportHeader: createBand({ components: [createComponent('text')] }),
      body: [
        createStaticBand(),
        createDataRegion('people', { header: createBand(), footer: createBand() }),
      ],
    });
    expect(validateTemplate(template).errors).toEqual([]);
  });

  it('cloneTemplate makes an independent deep copy', () => {
    const original = invoiceTemplate();
    const copy = cloneTemplate(original);
    expect(copy).toEqual(original);
    copy.reportHeader!.components[0]!.x = 99;
    expect(original.reportHeader!.components[0]!.x).toBe(0);
  });
});

describe('walkBands', () => {
  it('visits bands in design order with roles and paths', () => {
    const visits = [...walkBands(invoiceTemplate())].map((v) => [v.band.id, v.role, v.path]);
    expect(visits).toEqual([
      ['rh', 'reportHeader', 'reportHeader'],
      ['ph', 'pageHeader', 'pageHeader'],
      ['orders_header', 'regionHeader', 'body[0].header'],
      ['customer_header', 'groupHeader', 'body[0].groups[0].header'],
      ['order_detail', 'detail', 'body[0].detail'],
      ['item_detail', 'detail', 'body[0].children[0].detail'],
      ['customer_footer', 'groupFooter', 'body[0].groups[0].footer'],
      ['orders_footer', 'regionFooter', 'body[0].footer'],
      ['pf', 'pageFooter', 'pageFooter'],
      ['rf', 'reportFooter', 'reportFooter'],
    ]);
  });

  it('orders group footers innermost-first', () => {
    const t = invoiceTemplate();
    const region = t.body[0];
    if (region?.kind !== 'dataRegion') throw new Error('fixture changed');
    region.groups!.push({
      id: 'inner',
      expression: 'row.id',
      header: createBand({ id: 'inner_h' }),
      footer: createBand({ id: 'inner_f' }),
    });
    const ids = [...walkBands(t)].map((v) => v.band.id);
    expect(ids.indexOf('customer_header')).toBeLessThan(ids.indexOf('inner_h'));
    expect(ids.indexOf('inner_f')).toBeLessThan(ids.indexOf('customer_footer'));
  });

  it('includes static body bands and attaches regions', () => {
    const t = createTemplate({ dataSources: [{ name: 'a' }], body: [createStaticBand({ id: 's' }), createDataRegion('a', { id: 'r' })] });
    const visits = [...walkBands(t)];
    expect(visits[0]).toMatchObject({ role: 'static', path: 'body[0]' });
    expect(visits[0]!.region).toBeUndefined();
    expect(visits[1]!.region?.id).toBe('r');
  });
});

describe('findBand / findComponent', () => {
  it('finds bands and components by id', () => {
    const t = invoiceTemplate();
    expect(findBand(t, 'item_detail')?.region?.id).toBe('items_region');
    const found = findComponent(t, 'd_total');
    expect(found?.component.type).toBe('text');
    expect(found?.band.band.id).toBe('order_detail');
  });

  it('returns undefined for unknown ids', () => {
    const t = invoiceTemplate();
    expect(findBand(t, 'nope')).toBeUndefined();
    expect(findComponent(t, 'nope')).toBeUndefined();
  });
});
