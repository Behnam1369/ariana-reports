import { describe, expect, it } from 'vitest';
import { compileExpression, compileText, evaluateExpression as ev, ExpressionError } from '../../src/expressions';

describe('literals and operators', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ** 3 ** 2', 512],
    ['10 % 4', 2],
    ['7 / 2', 3.5],
    ['-3 + +"4"', 1],
    ['0x1f + 0b11 + 0o7', 41],
    ['1.5e2', 150],
    ['.5', 0.5],
    ['"a" + 1', 'a1'],
    ["'it\\'s'", "it's"],
    ['"tab\\there"', 'tab\there'],
    ['"\\u0041\\u{1F600}\\x42"', 'A\u{1F600}B'],
    ['1 < 2 && 2 <= 2 && 3 > 2 && 3 >= 3', true],
    ['1 == "1"', true],
    ['1 === "1"', false],
    ['1 != 2', true],
    ['null !== undefined', true],
    ['!0', true],
    ['typeof "x"', 'string'],
    ['typeof missing', 'undefined'],
    ['true ? "y" : "n"', 'y'],
    ['false ? 1 : 0 ? 2 : 3', 3],
    ['0 || "fallback"', 'fallback'],
    ['0 ?? "fallback"', 0],
    ['null ?? "fallback"', 'fallback'],
    ['"" && "never"', ''],
    ['`sum: ${1 + 2}!`', 'sum: 3!'],
    ['`${null}-${undefined}`', 'null-undefined'],
    ['[1, "a", [2]]', [1, 'a', [2]]],
    ['{ a: 1, b: { c: 2 } }', { a: 1, b: { c: 2 } }],
  ])('%s', (source, expected) => {
    expect(ev(source)).toEqual(expected);
  });

  it('short-circuits && and ||', () => {
    expect(ev('false && missing')).toBe(false);
    expect(ev('true || missing')).toBe(true);
    expect(ev('1 ?? missing')).toBe(1);
  });
});

describe('scope and member access', () => {
  const scope = {
    row: { name: 'Ada', total: 1250.5, tags: ['a', 'b'], address: { city: 'Paris' }, nothing: null },
    rows: [{ total: 1 }, { total: 2 }, { total: 3 }],
    params: { title: 'Report' },
  };

  it('reads nested fields, indices and lengths', () => {
    expect(ev('row.name', scope)).toBe('Ada');
    expect(ev('row.address.city', scope)).toBe('Paris');
    expect(ev('row["name"]', scope)).toBe('Ada');
    expect(ev('row.tags[1]', scope)).toBe('b');
    expect(ev('row.tags.length', scope)).toBe(2);
    expect(ev('row.name.length', scope)).toBe(3);
    expect(ev('row.name[0]', scope)).toBe('A');
    expect(ev('rows[2].total', scope)).toBe(3);
  });

  it('returns undefined for missing fields', () => {
    expect(ev('row.missing', scope)).toBeUndefined();
    expect(ev('row.tags[10]', scope)).toBeUndefined();
    expect(ev('row.tags.foo', scope)).toBeUndefined();
    expect(ev('(5).foo', scope)).toBeUndefined();
  });

  it('throws when reading from null or undefined', () => {
    expect(() => ev('row.nothing.x', scope)).toThrow(/Cannot read property "x" of null/);
    expect(() => ev('row.missing.x', scope)).toThrow(/of undefined/);
  });

  it('supports optional chaining with short-circuiting', () => {
    expect(ev('row.missing?.x', scope)).toBeUndefined();
    expect(ev('row.missing?.x.y.z', scope)).toBeUndefined();
    expect(ev('row.nothing?.["x"]', scope)).toBeUndefined();
    expect(ev('row.missing?.toUpperCase()', scope)).toBeUndefined();
    expect(ev('row.name?.toUpperCase()', scope)).toBe('ADA');
    expect(ev('row.missing?.()', scope)).toBeUndefined();
    expect(ev('missingFn?.()', { missingFn: null })).toBeUndefined();
  });

  it('throws for undefined identifiers', () => {
    expect(() => ev('nope', scope)).toThrow(/"nope" is not defined/);
  });

  it('does not expose JavaScript globals', () => {
    for (const name of ['window', 'globalThis', 'document', 'process', 'require', 'eval', 'Function', 'Object', 'JSON', 'fetch', 'setTimeout', 'Date', 'Array', 'String']) {
      expect(() => ev(name), name).toThrow(/is not defined/);
    }
  });

  it('builds new objects without mutating the scope', () => {
    const result = ev('{ name: row.name, total: row.total * 2 }', scope);
    expect(result).toEqual({ name: 'Ada', total: 2501 });
    expect(scope.row.total).toBe(1250.5);
  });
});

describe('lambdas and array methods', () => {
  const rows = [
    { name: 'b', qty: 2, price: 10 },
    { name: 'a', qty: 1, price: 5 },
    { name: 'c', qty: 4, price: 2.5 },
  ];

  it('supports map / filter / reduce / find / some / every', () => {
    expect(ev('rows.map(r => r.qty * r.price)', { rows })).toEqual([20, 5, 10]);
    expect(ev('rows.filter(r => r.qty > 1).map(r => r.name)', { rows })).toEqual(['b', 'c']);
    expect(ev('rows.reduce((acc, r) => acc + r.qty, 0)', { rows })).toBe(7);
    expect(ev('[1, 2, 3].reduce((a, b) => a + b)')).toBe(6);
    expect(ev('rows.find(r => r.name === "c").qty', { rows })).toBe(4);
    expect(ev('rows.findIndex(r => r.name === "a")', { rows })).toBe(1);
    expect(ev('rows.some(r => r.qty > 3)', { rows })).toBe(true);
    expect(ev('rows.every(r => r.qty > 3)', { rows })).toBe(false);
    expect(ev('rows.map((r, i) => i)', { rows })).toEqual([0, 1, 2]);
  });

  it('closes over outer lambda parameters', () => {
    expect(ev('[1, 2].map(x => [10, 20].map(y => x + y))')).toEqual([
      [11, 21],
      [12, 22],
    ]);
    expect(ev('(a => b => a * b)(3)(4)')).toBe(12);
  });

  it('lets lambda parameters shadow scope variables', () => {
    expect(ev('[1, 2].map(row => row * 2)', { row: 'outer' })).toEqual([2, 4]);
  });

  it('sort and reverse return copies and never mutate data', () => {
    const data = { rows: [...rows] };
    expect(ev('rows.sort((a, b) => a.qty - b.qty).map(r => r.name)', data)).toEqual(['a', 'b', 'c']);
    expect(ev('rows.reverse().map(r => r.name)', data)).toEqual(['c', 'a', 'b']);
    expect(ev('[3, 1, 2].sort()')).toEqual([1, 2, 3]);
    expect(data.rows.map((r) => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('supports other array helpers', () => {
    expect(ev('[1, 2, 3].includes(2)')).toBe(true);
    expect(ev('[1, 2, 3].indexOf(3)')).toBe(2);
    expect(ev('["a", "b"].join("-")')).toBe('a-b');
    expect(ev('[1, null, 2].join()')).toBe('1,,2');
    expect(ev('[1, 2, 3].slice(1)')).toEqual([2, 3]);
    expect(ev('[1, 2, 3].at(-1)')).toBe(3);
    expect(ev('[1].concat([2], 3)')).toEqual([1, 2, 3]);
    expect(ev('[[1, [2]], 3].flat()')).toEqual([1, [2], 3]);
    expect(ev('[1, 2].flatMap(x => [x, x])')).toEqual([1, 1, 2, 2]);
  });

  it('reports errors for misuse of array methods', () => {
    expect(() => ev('[1].map(1)')).toThrow(/map\(\) expects a function/);
    expect(() => ev('[].reduce((a, b) => a)')).toThrow(/initial value/);
    expect(() => ev('[1].push(2)')).toThrow(/"push" is not an allowed method on array/);
  });
});

describe('string, number and date methods', () => {
  it('supports the allowed string methods', () => {
    expect(ev('" Ada ".trim().toUpperCase()')).toBe('ADA');
    expect(ev('"abc".slice(1)')).toBe('bc');
    expect(ev('"a,b".split(",")')).toEqual(['a', 'b']);
    expect(ev('"5".padStart(3, "0")')).toBe('005');
    expect(ev('"ab".repeat(2)')).toBe('abab');
    expect(ev('"a-b-c".replaceAll("-", "+")')).toBe('a+b+c');
    expect(ev('"a-b".replace("-", "$&$&")')).toBe('a$&$&b');
    expect(ev('"abc".replace("b", m => m.toUpperCase())')).toBe('aBc');
    expect(ev('"Hello".startsWith("He") && "Hello".endsWith("lo") && "Hello".includes("ell")')).toBe(true);
  });

  it('supports number methods', () => {
    expect(ev('(3.14159).toFixed(2)')).toBe('3.14');
    expect(ev('(255).toString(16)')).toBe('ff');
    expect(ev('(true).toString()')).toBe('true');
  });

  it('supports date methods', () => {
    const d = new Date(2026, 2, 15, 13, 45);
    expect(ev('d.getFullYear() * 100 + d.getMonth() + 1', { d })).toBe(202603);
    expect(ev('d.getHours()', { d })).toBe(13);
    expect(ev('d.getTime()', { d })).toBe(d.getTime());
    expect(ev('d > e', { d, e: new Date(2020, 0, 1) })).toBe(true);
  });

  it('rejects methods outside the allow-list', () => {
    expect(() => ev('"x".big()')).toThrow(/not an allowed method on string/);
    expect(() => ev('d.setFullYear(2000)', { d: new Date() })).toThrow(/not an allowed method on date/);
    expect(() => ev('"abc".split(/b/)')).toThrow();
  });

  it('wraps native errors as ExpressionError', () => {
    expect(() => ev('(1).toFixed(500)')).toThrow(ExpressionError);
    expect(() => ev('(1).toFixed(500)')).toThrow(/toFixed/);
  });
});

describe('host functions', () => {
  it('calls functions registered with the functions option', () => {
    const functions = { double: (x: number) => x * 2, greet: (name: string) => `Hi ${name}` };
    expect(ev('double(21)', {}, { functions })).toBe(42);
    expect(ev('greet(row.name)', { row: { name: 'Ada' } }, { functions })).toBe('Hi Ada');
  });

  it('lets host functions receive and call sandbox lambdas', () => {
    const functions = { apply: (fn: (x: number) => number, v: number) => fn(v) };
    expect(ev('apply(x => x + 1, 1)', {}, { functions })).toBe(2);
  });

  it('wraps errors thrown by host functions', () => {
    const functions = {
      boom: () => {
        throw new Error('kaboom');
      },
    };
    expect(() => ev('boom()', {}, { functions })).toThrow(ExpressionError);
    expect(() => ev('boom()', {}, { functions })).toThrow('kaboom');
  });

  it('prefers scope variables over host functions over built-ins', () => {
    const functions = { sum: () => 'host' };
    expect(ev('sum()', {}, { functions })).toBe('host');
  });
});

describe('compileExpression', () => {
  it('compiles once and evaluates many times', () => {
    const expr = compileExpression('row.a + row.b');
    expect(expr.source).toBe('row.a + row.b');
    expect(expr.evaluate({ row: { a: 1, b: 2 } })).toBe(3);
    expect(expr.evaluate({ row: { a: 5, b: 5 } })).toBe(10);
  });

  it('throws syntax errors at compile time', () => {
    expect(() => compileExpression('1 +')).toThrow(ExpressionError);
  });

  it('attaches the source to runtime errors', () => {
    try {
      ev('row.x.y', { row: {} });
      expect.fail('should throw');
    } catch (err) {
      expect((err as ExpressionError).source).toBe('row.x.y');
    }
  });
});

describe('compileText', () => {
  it('interpolates placeholders', () => {
    const t = compileText('Hello {{ row.name }}, total {{ row.total * 2 }}!');
    expect(t.isStatic).toBe(false);
    expect(t.isSingleExpression).toBe(false);
    expect(t.evaluate({ row: { name: 'Ada', total: 21 } })).toBe('Hello Ada, total 42!');
  });

  it('renders null and undefined as empty text', () => {
    expect(compileText('[{{ a }}|{{ b }}]').evaluate({ a: null, b: undefined })).toBe('[|]');
  });

  it('handles static text and escapes', () => {
    const t = compileText('literal \\{{ x }}');
    expect(t.isStatic).toBe(true);
    expect(t.evaluate()).toBe('literal {{ x }}');
  });

  it('uses a custom stringify for interpolated values', () => {
    const t = compileText('{{ a }} and {{ b }}');
    expect(t.evaluate({ a: 1, b: 2 }, { stringify: (v) => `<${String(v)}>` })).toBe('<1> and <2>');
  });

  it('returns raw values for single-expression text', () => {
    const t = compileText('{{ row.total }}');
    expect(t.isSingleExpression).toBe(true);
    expect(t.evaluateValue({ row: { total: 12.5 } })).toBe(12.5);
    expect(compileText('#{{ row.total }}').evaluateValue({ row: { total: 1 } })).toBe('#1');
  });

  it('reports placeholder and syntax errors as ExpressionError', () => {
    expect(() => compileText('{{ a')).toThrow(/unterminated/);
    expect(() => compileText('{{ 1 + }}')).toThrow(ExpressionError);
  });
});
