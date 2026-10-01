import { describe, expect, it } from 'vitest';
import { checkExpression, ExpressionError, MAX_EXPRESSION_LENGTH, parseExpression } from '../../src/expressions';

describe('parseExpression: AST shape', () => {
  it('respects operator precedence', () => {
    expect(parseExpression('1 + 2 * 3')).toEqual({
      type: 'Binary',
      operator: '+',
      left: { type: 'Literal', value: 1 },
      right: {
        type: 'Binary',
        operator: '*',
        left: { type: 'Literal', value: 2 },
        right: { type: 'Literal', value: 3 },
      },
    });
  });

  it('parses ** as right-associative', () => {
    const ast = parseExpression('2 ** 3 ** 2') as any;
    expect(ast.left).toEqual({ type: 'Literal', value: 2 });
    expect(ast.right.operator).toBe('**');
  });

  it('parses member chains, calls and optional chaining', () => {
    const ast = parseExpression('a?.b[c](1)') as any;
    expect(ast.type).toBe('Call');
    expect(ast.callee).toMatchObject({ type: 'Member', computed: true, optional: false });
    expect(ast.callee.object).toMatchObject({ type: 'Member', computed: false, optional: true });
  });

  it('parses arrow functions with zero, one and many params', () => {
    expect(parseExpression('() => 1')).toMatchObject({ type: 'Arrow', params: [] });
    expect(parseExpression('x => x')).toMatchObject({ type: 'Arrow', params: ['x'] });
    expect(parseExpression('(a, b) => a + b')).toMatchObject({ type: 'Arrow', params: ['a', 'b'] });
  });

  it('parses a parenthesized expression that is not an arrow', () => {
    expect(parseExpression('(a + b) * 2')).toMatchObject({ type: 'Binary', operator: '*' });
  });

  it('parses object literals including shorthand and string/number keys', () => {
    expect(parseExpression('{ a: 1, "b c": 2, 3: 4, d }')).toEqual({
      type: 'Object',
      properties: [
        { key: 'a', value: { type: 'Literal', value: 1 } },
        { key: 'b c', value: { type: 'Literal', value: 2 } },
        { key: '3', value: { type: 'Literal', value: 4 } },
        { key: 'd', value: { type: 'Identifier', name: 'd' } },
      ],
    });
  });

  it('parses template literals with nested expressions', () => {
    const ast = parseExpression('`a${x}b${ `c${y}` }`') as any;
    expect(ast.type).toBe('Template');
    expect(ast.quasis).toEqual(['a', 'b', '']);
    expect(ast.expressions[1].type).toBe('Template');
  });

  it('treats "?." followed by a digit as a conditional', () => {
    expect(parseExpression('a?.5:1')).toMatchObject({ type: 'Conditional' });
  });

  it('reads literal keywords', () => {
    expect(parseExpression('null')).toEqual({ type: 'Literal', value: null });
    expect(parseExpression('undefined')).toEqual({ type: 'Literal', value: undefined });
    expect((parseExpression('NaN') as any).value).toBeNaN();
  });

  it('accepts trailing commas in calls and arrays', () => {
    expect(checkExpression('f(1, 2,)')).toBeNull();
    expect(checkExpression('[1, 2,]')).toBeNull();
  });
});

describe('parseExpression: syntax errors', () => {
  it.each([
    ['', /empty/],
    ['   ', /empty/],
    ['1 +', /Unexpected end/],
    ['(1 + 2', /Expected "\)"/],
    ['a b', /Unexpected "b"/],
    ['a = 1', /Assignment is not allowed/],
    ['a; b', /Statements are not allowed/],
    ['"abc', /Unterminated string/],
    ['`abc', /Unterminated template/],
    ['`${}`', /Empty template substitution/],
    ['`${ a `', /Unterminated/],
    ['3in', /Invalid number/],
    ['a # b', /Unexpected character "#"/],
    ['new Date()', /"new" is not supported/],
    ['this.x', /"this" is not supported/],
    ['function () {}', /"function" is not supported/],
    ['x => { return 1 }', /expression body/],
    ['(a, a) => a', /Duplicate parameter/],
    ['(true) => 1', /cannot be used as a parameter/],
    ['{ __proto__: 1 }', /__proto__/],
    ['{ a: 1, a: 2 }', /Duplicate object key/],
    ['{ [k]: 1 }', /Computed object keys/],
    ['[1, , 2]', /Array holes/],
    ['-2 ** 2', /must be parenthesized/],
    ['tag`x`', /Tagged templates/],
    ['a.1', /Unexpected number/],
    ['a.', /property name/],
    ['"\\u{110000}"', /Invalid Unicode escape/],
    ['"\\xZZ"', /Invalid hexadecimal escape/],
  ])('rejects %j', (source, message) => {
    expect(() => parseExpression(source)).toThrow(ExpressionError);
    expect(() => parseExpression(source)).toThrow(message);
  });

  it('reports the error position', () => {
    try {
      parseExpression('1 + )');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect((err as ExpressionError).position).toBe(4);
      expect((err as ExpressionError).source).toBe('1 + )');
      expect((err as Error).message).toMatch(/at position 4/);
    }
  });

  it('rejects overly long and overly nested expressions', () => {
    expect(() => parseExpression('1'.repeat(MAX_EXPRESSION_LENGTH + 1))).toThrow(/longer than/);
    expect(() => parseExpression('('.repeat(500) + '1' + ')'.repeat(500))).toThrow(/nested too deeply/);
    expect(() => parseExpression('-'.repeat(500) + '1')).toThrow(/nested too deeply/);
  });

  it('rejects non-string input', () => {
    expect(() => parseExpression(42 as unknown as string)).toThrow(/must be a string/);
  });
});

describe('checkExpression', () => {
  it('returns null for valid expressions', () => {
    expect(checkExpression('sum(rows, r => r.total) > 100 ? "big" : "small"')).toBeNull();
  });

  it('returns a message for invalid expressions', () => {
    expect(checkExpression('1 +')).toMatch(/Unexpected end/);
  });
});
