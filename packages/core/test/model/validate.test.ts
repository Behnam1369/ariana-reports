import { describe, expect, it } from 'vitest';
import {
  createTemplate,
  parseTemplate,
  scanPlaceholders,
  TemplateValidationError,
  validateTemplate,
  type ReportTemplate,
} from '../../src/model';
import { invoiceTemplate } from '../fixtures/invoice';

/** Applies a mutation to a fresh copy of the sample and returns the error paths/messages. */
function errorsAfter(mutate: (t: any) => void): { path: string; message: string }[] {
  const t = invoiceTemplate() as any;
  mutate(t);
  return validateTemplate(t).errors;
}

function expectError(mutate: (t: any) => void, path: string, message?: string | RegExp): void {
  const errors = errorsAfter(mutate);
  const match = errors.find((e) => e.path === path);
  expect(match, `expected an error at "${path}", got ${JSON.stringify(errors)}`).toBeDefined();
  if (message !== undefined) expect(match!.message).toMatch(message);
}

describe('validateTemplate: valid templates', () => {
  it('accepts the realistic sample template', () => {
    const result = validateTemplate(invoiceTemplate());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts the template produced by createTemplate()', () => {
    expect(validateTemplate(createTemplate()).errors).toEqual([]);
  });

  it('accepts a custom page size and all color formats', () => {
    const errors = errorsAfter((t) => {
      t.page.size = { width: 100, height: 50 };
      t.styles.heading.color = '#abc';
      t.styles.heading.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      t.styles.cell.color = 'transparent';
      t.styles.cell.backgroundColor = '#11223344';
    });
    expect(errors).toEqual([]);
  });

  it('accepts a static band in the body and per-side padding', () => {
    const errors = errorsAfter((t) => {
      t.body.unshift({
        kind: 'band',
        id: 'intro',
        height: 10,
        components: [
          {
            id: 'intro_text',
            type: 'text',
            x: 0,
            y: 0,
            width: 50,
            height: 5,
            text: 'Hello',
            style: { padding: { top: 1, right: 2, bottom: 1, left: 2 } },
          },
        ],
      });
    });
    expect(errors).toEqual([]);
  });

  it('accepts a child region that uses its own data source', () => {
    const errors = errorsAfter((t) => {
      const child = t.body[0].children[0];
      delete child.relation;
      child.dataSource = 'orders';
    });
    expect(errors).toEqual([]);
  });

  it('accepts every format type', () => {
    const errors = errorsAfter((t) => {
      const comps = t.body[0].detail.components;
      comps[0].format = { type: 'number', decimals: 2, thousandsSeparator: true, prefix: '$', suffix: '!' };
      comps[1].format = { type: 'percent', decimals: 1 };
      t.reportHeader.components[0].format = { type: 'date', pattern: 'yyyy-MM-dd' };
    });
    expect(errors).toEqual([]);
  });
});

describe('validateTemplate: root and page', () => {
  it.each([null, 42, 'x', []])('rejects a non-object root (%j)', (value) => {
    const result = validateTemplate(value);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ path: '', message: 'must be an object' }]);
  });

  it('rejects a wrong schemaVersion', () => {
    expectError((t) => (t.schemaVersion = 2), 'schemaVersion', 'must be 1');
  });

  it('rejects an empty name', () => {
    expectError((t) => (t.name = '  '), 'name', 'must not be empty');
  });

  it('rejects an unknown unit', () => {
    expectError((t) => (t.unit = 'furlong'), 'unit', /must be one of/);
  });

  it('rejects an invalid locale', () => {
    expectError((t) => (t.locale = 'not a locale!'), 'locale', /BCP 47/);
  });

  it('rejects unknown root properties', () => {
    expectError((t) => (t.extra = true), 'extra', 'unknown property');
  });

  it('rejects an unknown paper size', () => {
    expectError((t) => (t.page.size = 'B9'), 'page.size', /must be one of/);
  });

  it('rejects a non-positive custom page size', () => {
    expectError((t) => (t.page.size = { width: 0, height: 10 }), 'page.size.width', /greater than 0/);
  });

  it('rejects an invalid orientation', () => {
    expectError((t) => (t.page.orientation = 'diagonal'), 'page.orientation');
  });

  it('rejects negative and missing margins', () => {
    expectError((t) => (t.page.margins.top = -1), 'page.margins.top', /at least 0/);
    expectError((t) => delete t.page.margins.left, 'page.margins.left', /finite number/);
  });

  it('rejects a missing page object', () => {
    expectError((t) => delete t.page, 'page', 'must be an object');
  });

  it('rejects a missing body', () => {
    expectError((t) => delete t.body, 'body', 'must be an array');
  });
});

describe('validateTemplate: data sources and parameters', () => {
  it('rejects a non-identifier data source name', () => {
    expectError((t) => (t.dataSources[0].name = 'my orders'), 'dataSources[0].name', /identifier/);
  });

  it('rejects reserved data source names', () => {
    expectError((t) => (t.dataSources[0].name = 'row'), 'dataSources[0].name', /reserved/);
  });

  it('rejects duplicate data source names', () => {
    expectError(
      (t) => t.dataSources.push({ name: 'orders' }),
      'dataSources[1].name',
      /duplicate data source name/,
    );
  });

  it('rejects a malformed data source path', () => {
    expectError((t) => (t.dataSources[0].path = 'sales..orders'), 'dataSources[0].path', /dot-separated/);
  });

  it('rejects duplicate and badly typed fields, including nested ones', () => {
    expectError(
      (t) => t.dataSources[0].fields.push({ name: 'id', type: 'number' }),
      'dataSources[0].fields[5].name',
      /duplicate field/,
    );
    expectError((t) => (t.dataSources[0].fields[4].fields[0].type = 'blob'), 'dataSources[0].fields[4].fields[0].type');
  });

  it('rejects duplicate and invalid parameter names', () => {
    expectError(
      (t) => t.parameters.push({ name: 'title', type: 'string' }),
      'parameters[1].name',
      /duplicate parameter/,
    );
    expectError((t) => (t.parameters[0].name = '1st'), 'parameters[0].name', /identifier/);
  });
});

describe('validateTemplate: styles', () => {
  it('rejects invalid colors', () => {
    expectError((t) => (t.styles.heading.color = 'reddish'), 'styles.heading.color', /must be a color/);
  });

  it('rejects a non-positive font size', () => {
    expectError((t) => (t.styles.heading.fontSize = 0), 'styles.heading.fontSize', /greater than 0/);
  });

  it('rejects invalid enums', () => {
    expectError((t) => (t.styles.heading.fontWeight = 'heavy'), 'styles.heading.fontWeight');
    expectError((t) => (t.styles.heading.textAlign = 'middle'), 'styles.heading.textAlign');
    expectError((t) => (t.styles.heading.verticalAlign = 'center'), 'styles.heading.verticalAlign');
  });

  it('rejects unknown style keys', () => {
    expectError((t) => (t.styles.heading.zIndex = 3), 'styles.heading.zIndex', 'unknown property');
  });

  it('rejects invalid padding', () => {
    expectError((t) => (t.styles.cell.padding = -2), 'styles.cell.padding', /at least 0/);
    expectError((t) => (t.styles.cell.padding = 'wide'), 'styles.cell.padding', /number or/);
  });

  it('rejects invalid border specs', () => {
    expectError((t) => (t.styles.cell.border.style = 'wavy'), 'styles.cell.border.style');
    expectError((t) => (t.styles.cell.border.sides = ['top', 'middle']), 'styles.cell.border.sides[1]');
    expectError((t) => delete t.styles.cell.border.color, 'styles.cell.border.color', /string/);
  });

  it('rejects text styles on bands', () => {
    expectError(
      (t) => (t.body[0].header.style.fontSize = 12),
      'body[0].header.style.fontSize',
      /only backgroundColor and border/,
    );
  });
});

describe('validateTemplate: bands', () => {
  it('rejects a negative band height', () => {
    expectError((t) => (t.reportHeader.height = -5), 'reportHeader.height', /at least 0/);
  });

  it('rejects printOnFirstPage on non-page bands', () => {
    expectError((t) => (t.reportHeader.printOnFirstPage = false), 'reportHeader.printOnFirstPage', 'unknown property');
  });

  it('rejects non-boolean band flags', () => {
    expectError((t) => (t.reportHeader.canGrow = 'yes'), 'reportHeader.canGrow', /boolean/);
  });

  it('rejects a missing components array', () => {
    expectError((t) => delete t.reportHeader.components, 'reportHeader.components', /array/);
  });

  it('rejects an unknown body item kind', () => {
    expectError((t) => (t.body[0].kind = 'table'), 'body[0].kind', /"band" or "dataRegion"/);
  });

  it('rejects duplicate ids across the whole template', () => {
    expectError((t) => (t.pageFooter.id = 'rh'), 'pageFooter.id', /duplicate id "rh" \(first used at reportHeader.id\)/);
    expectError(
      (t) => (t.reportFooter.components[0].id = 'title'),
      'reportFooter.components[0].id',
      /duplicate id "title"/,
    );
  });
});

describe('validateTemplate: data regions', () => {
  it('requires a data source on top-level regions', () => {
    expectError((t) => delete t.body[0].dataSource, 'body[0].dataSource', 'is required');
  });

  it('rejects unknown data sources', () => {
    expectError((t) => (t.body[0].dataSource = 'customers'), 'body[0].dataSource', /unknown data source "customers"/);
  });

  it('rejects relation on top-level regions', () => {
    expectError((t) => (t.body[0].relation = 'items'), 'body[0].relation', /only child regions/);
  });

  it('requires exactly one of dataSource/relation on child regions', () => {
    expectError((t) => delete t.body[0].children[0].relation, 'body[0].children[0]', /must set dataSource or relation/);
    expectError(
      (t) => (t.body[0].children[0].dataSource = 'orders'),
      'body[0].children[0]',
      /not both/,
    );
  });

  it('requires a detail band', () => {
    expectError((t) => delete t.body[0].detail, 'body[0].detail', 'is required');
  });

  it('validates sort rules and groups', () => {
    expectError((t) => (t.body[0].sort[0].direction = 'up'), 'body[0].sort[0].direction');
    expectError((t) => (t.body[0].sort[0].expression = ''), 'body[0].sort[0].expression', /not be empty/);
    expectError((t) => delete t.body[0].groups[0].expression, 'body[0].groups[0].expression', /string/);
    expectError((t) => (t.body[0].groups[0].sortDirection = 'random'), 'body[0].groups[0].sortDirection');
  });

  it('validates bands nested in groups and child regions', () => {
    expectError((t) => (t.body[0].groups[0].footer.height = 'tall'), 'body[0].groups[0].footer.height');
    expectError(
      (t) => (t.body[0].children[0].detail.components[0].x = -1),
      'body[0].children[0].detail.components[0].x',
      /at least 0/,
    );
  });
});

describe('validateTemplate: components', () => {
  const detail = 'body[0].detail.components';

  it('rejects unknown component types', () => {
    expectError((t) => (t.body[0].detail.components[0].type = 'chart'), `${detail}[0].type`, /must be one of/);
  });

  it('rejects properties that do not belong to the component type', () => {
    expectError((t) => (t.body[0].detail.components[0].src = 'x.png'), `${detail}[0].src`, 'unknown property');
  });

  it('rejects negative geometry', () => {
    expectError((t) => (t.body[0].detail.components[0].width = -1), `${detail}[0].width`);
    expectError((t) => (t.body[0].detail.components[0].y = Number.NaN), `${detail}[0].y`, /finite/);
  });

  it('rejects references to unknown styles', () => {
    expectError((t) => (t.body[0].detail.components[0].styleName = 'nope'), `${detail}[0].styleName`, /unknown style/);
  });

  it('rejects malformed placeholders', () => {
    expectError((t) => (t.body[0].detail.components[0].text = 'Total {{ row.total'), `${detail}[0].text`, /unterminated/);
    expectError((t) => (t.body[0].detail.components[0].text = 'x {{ }} y'), `${detail}[0].text`, /empty/);
  });

  it('validates conditional styles', () => {
    expectError((t) => delete t.body[0].detail.components[1].conditions[0].style, `${detail}[1].conditions[0].style`, 'is required');
    expectError(
      (t) => (t.body[0].detail.components[1].conditions[0].style.color = 'nope'),
      `${detail}[1].conditions[0].style.color`,
    );
  });

  it('validates formats', () => {
    expectError((t) => (t.body[0].detail.components[1].format = { type: 'roman' }), `${detail}[1].format.type`);
    expectError(
      (t) => (t.body[0].detail.components[1].format = { type: 'currency', currency: 'dollars' }),
      `${detail}[1].format.currency`,
      /ISO 4217/,
    );
    expectError(
      (t) => (t.body[0].detail.components[1].format = { type: 'number', decimals: 1.5 }),
      `${detail}[1].format.decimals`,
      /integer/,
    );
    expectError(
      (t) => (t.body[0].detail.components[1].format = { type: 'date' }),
      `${detail}[1].format.pattern`,
    );
  });

  it('validates image, line and rectangle specifics', () => {
    expectError((t) => (t.reportFooter.components[0].fit = 'stretch'), 'reportFooter.components[0].fit');
    expectError((t) => (t.pageHeader.components[0].orientation = 'diagonal'), 'pageHeader.components[0].orientation');
    expectError(
      (t) =>
        t.reportFooter.components.push({ id: 'r', type: 'rectangle', x: 0, y: 0, width: 1, height: 1, cornerRadius: -1 }),
      'reportFooter.components[1].cornerRadius',
    );
  });
});

describe('validateTemplate: expression checker hook', () => {
  it('reports problems from the supplied checker with their paths', () => {
    const checkExpression = (src: string) => (src.includes('BAD') ? 'nope' : null);
    const t = invoiceTemplate() as any;
    t.body[0].filter = 'BAD';
    t.body[0].detail.components[0].text = '{{ row.id }} {{ BAD + 1 }}';
    const { errors } = validateTemplate(t, { checkExpression });
    expect(errors).toEqual([
      { path: 'body[0].filter', message: 'invalid expression: nope' },
      { path: 'body[0].detail.components[0].text', message: 'invalid expression "BAD + 1": nope' },
    ]);
  });

  it('passes every expression in the sample to the checker', () => {
    const seen: string[] = [];
    validateTemplate(invoiceTemplate(), { checkExpression: (s) => (seen.push(s), null) });
    expect(seen).toEqual(
      expect.arrayContaining([
        'params.title',
        'row.total > 0',
        'row.date',
        'row.customer',
        'group.key',
        'sum(group.rows, r => r.total)',
        'row.total > 1000',
        'page.number',
        'page.count',
      ]),
    );
  });
});

describe('validateTemplate: built-in expression checking', () => {
  it('checks expression syntax by default', () => {
    const t = invoiceTemplate() as any;
    t.body[0].filter = 'row.total >';
    t.body[0].detail.components[0].text = '{{ row.id + }}';
    t.body[0].groups[0].expression = 'new Thing()';
    const paths = validateTemplate(t).errors.map((e) => e.path);
    expect(paths).toEqual([
      'body[0].filter',
      'body[0].groups[0].expression',
      'body[0].detail.components[0].text',
    ]);
  });

  it('can skip expression checks with checkExpression: false', () => {
    const t = invoiceTemplate() as any;
    t.body[0].filter = 'row.total >';
    expect(validateTemplate(t, { checkExpression: false }).errors).toEqual([]);
  });
});

describe('validateTemplate: error collection', () => {
  it('collects every error instead of stopping at the first one', () => {
    const errors = errorsAfter((t) => {
      t.name = '';
      t.unit = 'x';
      t.page.margins.top = -1;
      t.body[0].dataSource = 'missing';
    });
    expect(errors.map((e) => e.path)).toEqual(['name', 'unit', 'page.margins.top', 'body[0].dataSource']);
  });
});

describe('parseTemplate', () => {
  it('parses a valid JSON string', () => {
    const json = JSON.stringify(invoiceTemplate());
    const t: ReportTemplate = parseTemplate(json);
    expect(t.name).toBe('Orders by customer');
  });

  it('accepts an already-parsed object', () => {
    const t = invoiceTemplate();
    expect(parseTemplate(t)).toBe(t);
  });

  it('throws TemplateValidationError for invalid JSON', () => {
    expect(() => parseTemplate('{ nope')).toThrow(TemplateValidationError);
    try {
      parseTemplate('{ nope');
    } catch (err) {
      expect((err as TemplateValidationError).errors[0]!.message).toMatch(/not valid JSON/);
    }
  });

  it('throws TemplateValidationError listing the errors', () => {
    const bad = { ...invoiceTemplate(), unit: 'x', name: '' };
    try {
      parseTemplate(bad);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateValidationError);
      const e = err as TemplateValidationError;
      expect(e.errors.map((x) => x.path)).toEqual(['name', 'unit']);
      expect(e.message).toMatch(/^Invalid report template: name: must not be empty; unit: must be one of/);
    }
  });

  it('truncates long error lists in the message', () => {
    const errors = Array.from({ length: 8 }, (_, i) => ({ path: `p${i}`, message: 'bad' }));
    expect(new TemplateValidationError(errors).message).toMatch(/\(and 3 more\)$/);
  });
});

describe('scanPlaceholders', () => {
  it('returns expressions in order, trimmed', () => {
    expect(scanPlaceholders('A {{ a }} B {{b.c}} C')).toEqual(['a', 'b.c']);
  });

  it('returns an empty list for plain text', () => {
    expect(scanPlaceholders('no placeholders here')).toEqual([]);
  });

  it('skips escaped placeholders', () => {
    expect(scanPlaceholders('literal \\{{ x }} and {{ y }}')).toEqual(['y']);
  });

  it('reports unterminated and empty placeholders', () => {
    expect(scanPlaceholders('{{ a')).toMatch(/unterminated/);
    expect(scanPlaceholders('{{   }}')).toMatch(/empty/);
  });
});
