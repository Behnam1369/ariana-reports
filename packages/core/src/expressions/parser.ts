import type { BinaryOperator, Node } from './ast';
import { ExpressionError } from './errors';
import { tokenize, type Token } from './tokenizer';

/** Maximum expression length, as a guard against pathological input. */
export const MAX_EXPRESSION_LENGTH = 10_000;
/** Maximum syntactic nesting, as a guard against stack exhaustion while parsing. */
const MAX_NESTING = 200;

const LITERAL_KEYWORDS: Record<string, unknown> = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
  NaN: Number.NaN,
  Infinity: Number.POSITIVE_INFINITY,
};

const UNSUPPORTED_KEYWORDS = new Set([
  'new',
  'this',
  'function',
  'class',
  'delete',
  'void',
  'in',
  'instanceof',
  'var',
  'let',
  'const',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'throw',
  'try',
  'catch',
  'finally',
  'yield',
  'await',
  'async',
  'import',
  'export',
  'super',
  'with',
  'debugger',
]);

// Binary operator precedence; higher binds tighter.
const BINARY_PRECEDENCE: Record<string, number> = {
  '??': 1,
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '===': 3,
  '!==': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '**': 7,
};

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  parse(): Node {
    const node = this.expression();
    const t = this.peek();
    if (t.type !== 'eof') this.unexpected(t);
    return node;
  }

  // -- helpers -------------------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private isPunc(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'punc' && t.value === value;
  }

  private eat(value: string): boolean {
    if (this.isPunc(value)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) {
      const t = this.peek();
      this.fail(`Expected "${value}" but found ${describe(t)}`, t.start);
    }
  }

  private fail(message: string, position: number): never {
    throw new ExpressionError(message, this.source, position);
  }

  private unexpected(t: Token): never {
    if (t.type === 'eof') this.fail('Unexpected end of expression', t.start);
    this.fail(`Unexpected ${describe(t)}`, t.start);
  }

  private enter(t: Token): void {
    if (++this.depth > MAX_NESTING) this.fail('Expression is nested too deeply', t.start);
  }

  // -- grammar -------------------------------------------------------------

  /** expression := arrow | conditional */
  private expression(): Node {
    const t = this.peek();
    this.enter(t);
    try {
      if (this.isArrowStart()) return this.arrow();
      return this.conditional();
    } finally {
      this.depth--;
    }
  }

  private isArrowStart(): boolean {
    const t = this.peek();
    if (t.type === 'ident' && this.isPunc('=>', 1)) return true;
    if (!this.isPunc('(')) return false;
    // Scan for the matching ")" and check that "=>" follows.
    let depth = 0;
    for (let i = this.pos; i < this.tokens.length; i++) {
      const tok = this.tokens[i]!;
      if (tok.type === 'eof') return false;
      if (tok.type === 'punc') {
        if (tok.value === '(' || tok.value === '[' || tok.value === '{') depth++;
        else if (tok.value === ')' || tok.value === ']' || tok.value === '}') {
          depth--;
          if (depth === 0) {
            const after = this.tokens[i + 1];
            return after?.type === 'punc' && after.value === '=>';
          }
        }
      }
    }
    return false;
  }

  private arrow(): Node {
    const params: string[] = [];
    if (this.peek().type === 'ident') {
      params.push(this.paramName(this.next()));
    } else {
      this.expect('(');
      if (!this.isPunc(')')) {
        do {
          params.push(this.paramName(this.next()));
        } while (this.eat(','));
      }
      this.expect(')');
    }
    const seen = new Set<string>();
    for (const p of params) {
      if (seen.has(p)) this.fail(`Duplicate parameter "${p}"`, this.peek().start);
      seen.add(p);
    }
    this.expect('=>');
    if (this.isPunc('{')) this.fail('Arrow functions must have an expression body', this.peek().start);
    return { type: 'Arrow', params, body: this.expression() };
  }

  private paramName(t: Token): string {
    if (t.type !== 'ident') this.fail(`Expected a parameter name but found ${describe(t)}`, t.start);
    const name = (t as { value: string }).value;
    if (name in LITERAL_KEYWORDS || UNSUPPORTED_KEYWORDS.has(name) || name === 'typeof') {
      this.fail(`"${name}" cannot be used as a parameter name`, t.start);
    }
    return name;
  }

  private conditional(): Node {
    const test = this.binary(1);
    if (!this.eat('?')) return test;
    const consequent = this.expression();
    this.expect(':');
    const alternate = this.expression();
    return { type: 'Conditional', test, consequent, alternate };
  }

  private binary(minPrecedence: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'punc') break;
      const precedence = BINARY_PRECEDENCE[t.value];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.next();
      // "**" is right-associative.
      const right = this.binary(t.value === '**' ? precedence : precedence + 1);
      if (t.value === '&&' || t.value === '||' || t.value === '??') {
        left = { type: 'Logical', operator: t.value, left, right };
      } else {
        left = { type: 'Binary', operator: t.value as BinaryOperator, left, right };
      }
    }
    return left;
  }

  private unary(): Node {
    const t = this.peek();
    if (t.type === 'punc' && (t.value === '!' || t.value === '-' || t.value === '+')) {
      this.next();
      this.enter(t);
      try {
        const argument = this.unary();
        if (this.isPunc('**')) this.fail('Unary operator before "**" must be parenthesized', this.peek().start);
        return { type: 'Unary', operator: t.value, argument };
      } finally {
        this.depth--;
      }
    }
    if (t.type === 'ident' && t.value === 'typeof') {
      this.next();
      this.enter(t);
      try {
        return { type: 'Unary', operator: 'typeof', argument: this.unary() };
      } finally {
        this.depth--;
      }
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.eat('.')) {
        node = { type: 'Member', object: node, property: this.propertyName(), computed: false, optional: false };
      } else if (this.eat('?.')) {
        if (this.eat('(')) {
          node = { type: 'Call', callee: node, args: this.args(), optional: true };
        } else if (this.eat('[')) {
          const property = this.expression();
          this.expect(']');
          node = { type: 'Member', object: node, property, computed: true, optional: true };
        } else {
          node = { type: 'Member', object: node, property: this.propertyName(), computed: false, optional: true };
        }
      } else if (this.eat('[')) {
        const property = this.expression();
        this.expect(']');
        node = { type: 'Member', object: node, property, computed: true, optional: false };
      } else if (this.eat('(')) {
        node = { type: 'Call', callee: node, args: this.args(), optional: false };
      } else if (this.peek().type === 'template') {
        this.fail('Tagged templates are not supported', this.peek().start);
      } else {
        return node;
      }
    }
  }

  private propertyName(): Node {
    const t = this.next();
    if (t.type !== 'ident') this.fail(`Expected a property name but found ${describe(t)}`, t.start);
    return { type: 'Literal', value: (t as { value: string }).value };
  }

  /** Arguments after "(" up to and including ")". */
  private args(): Node[] {
    const args: Node[] = [];
    if (this.eat(')')) return args;
    do {
      if (this.isPunc(')')) break; // trailing comma
      args.push(this.expression());
    } while (this.eat(','));
    this.expect(')');
    return args;
  }

  private primary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'num':
        return { type: 'Literal', value: t.value };
      case 'str':
        return { type: 'Literal', value: t.value };
      case 'template':
        return {
          type: 'Template',
          quasis: t.quasis,
          expressions: t.expressions.map((tokens) => new Parser(tokens, this.source).parse()),
        };
      case 'ident': {
        if (Object.hasOwn(LITERAL_KEYWORDS, t.value)) {
          return { type: 'Literal', value: LITERAL_KEYWORDS[t.value] as LiteralValue };
        }
        if (UNSUPPORTED_KEYWORDS.has(t.value)) this.fail(`"${t.value}" is not supported in expressions`, t.start);
        return { type: 'Identifier', name: t.value };
      }
      case 'punc':
        if (t.value === '(') {
          const node = this.expression();
          this.expect(')');
          return node;
        }
        if (t.value === '[') return this.arrayLiteral();
        if (t.value === '{') return this.objectLiteral(t);
        return this.unexpected(t);
      default:
        return this.unexpected(t);
    }
  }

  private arrayLiteral(): Node {
    const elements: Node[] = [];
    while (!this.isPunc(']')) {
      if (this.isPunc(',')) this.fail('Array holes are not supported', this.peek().start);
      elements.push(this.expression());
      if (!this.eat(',')) break;
    }
    this.expect(']');
    return { type: 'Array', elements };
  }

  private objectLiteral(open: Token): Node {
    const properties: { key: string; value: Node }[] = [];
    const seen = new Set<string>();
    while (!this.isPunc('}')) {
      const t = this.next();
      let key: string;
      if (t.type === 'ident' || t.type === 'str') key = t.value;
      else if (t.type === 'num') key = String(t.value);
      else if (t.type === 'punc' && t.value === '[') this.fail('Computed object keys are not supported', t.start);
      else this.unexpected(t);
      key = key!;
      if (key === '__proto__') this.fail('"__proto__" is not allowed as an object key', t.start);
      if (seen.has(key)) this.fail(`Duplicate object key "${key}"`, t.start);
      seen.add(key);
      let value: Node;
      if (this.eat(':')) {
        value = this.expression();
      } else if (t.type === 'ident' && (this.isPunc(',') || this.isPunc('}'))) {
        value = { type: 'Identifier', name: key }; // shorthand { a }
      } else {
        const n = this.peek();
        this.fail(`Expected ":" but found ${describe(n)}`, n.start);
      }
      properties.push({ key, value: value! });
      if (!this.eat(',')) break;
    }
    if (!this.isPunc('}')) this.fail(`Expected "}" to close the object started at ${open.start}`, this.peek().start);
    this.next();
    return { type: 'Object', properties };
  }
}

type LiteralValue = string | number | boolean | null | undefined;

function describe(t: Token): string {
  switch (t.type) {
    case 'eof':
      return 'end of expression';
    case 'num':
      return `number ${t.value}`;
    case 'str':
      return 'string';
    case 'template':
      return 'template literal';
    case 'ident':
      return `"${t.value}"`;
    case 'punc':
      return `"${t.value}"`;
  }
}

/** Parses an expression into an AST. Throws `ExpressionError` on syntax errors. */
export function parseExpression(source: string): Node {
  if (typeof source !== 'string') throw new ExpressionError('Expression must be a string', String(source));
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`Expression is longer than ${MAX_EXPRESSION_LENGTH} characters`, source.slice(0, 100));
  }
  const tokens = tokenize(source);
  if (tokens.length === 1) throw new ExpressionError('Expression is empty', source, 0);
  return new Parser(tokens, source).parse();
}
