import { DEFAULT_LOCALE, toDisplayString } from '../format/format';
import type { Node } from './ast';
import { getBuiltins } from './builtins';
import { ExpressionError } from './errors';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS, run, type InterpreterContext } from './interpreter';
import { parseExpression } from './parser';
import { splitPlaceholders, type TextPart } from './text';

export { ExpressionError } from './errors';
export { BUILTIN_NAMES, getBuiltins } from './builtins';
export { MAX_EXPRESSION_LENGTH, parseExpression } from './parser';
export { MAX_ARRAY_LENGTH, MAX_STRING_LENGTH } from './safety';
export { DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS } from './interpreter';
export { splitPlaceholders, type TextPart } from './text';
export type { Node as ExpressionNode } from './ast';

/** Variables visible to an expression, e.g. `{ row, params, page }`. */
export type ExpressionScope = Readonly<Record<string, unknown>>;

export interface EvaluateOptions {
  /** Locale used by formatting built-ins. Defaults to "en-US". */
  locale?: string;
  /** Extra functions callable from expressions. They run as normal host code. */
  functions?: Readonly<Record<string, (...args: any[]) => unknown>>;
  /** Maximum evaluation steps per evaluation. Defaults to 1,000,000. */
  maxSteps?: number;
  /** Maximum nested lambda calls. Defaults to 100. */
  maxDepth?: number;
}

export interface CompiledExpression {
  readonly source: string;
  evaluate(scope?: ExpressionScope, options?: EvaluateOptions): unknown;
}

const astCache = new Map<string, Node>();
const MAX_CACHE = 2000;

function parseCached(source: string): Node {
  let ast = astCache.get(source);
  if (!ast) {
    ast = parseExpression(source);
    if (astCache.size >= MAX_CACHE) astCache.clear();
    astCache.set(source, ast);
  }
  return ast;
}

function execute(ast: Node, source: string, scope: ExpressionScope, options: EvaluateOptions): unknown {
  const ctx: InterpreterContext = {
    source,
    scope,
    functions: options.functions,
    builtins: getBuiltins(options.locale ?? DEFAULT_LOCALE),
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    steps: 0,
    depth: 0,
  };
  try {
    return run(ast, ctx);
  } catch (err) {
    if (err instanceof ExpressionError) {
      if (err.source === '') throw new ExpressionError(err.message, source);
      throw err;
    }
    // Errors from native operations (e.g. toFixed(500)) or host functions.
    const message = err instanceof Error ? err.message : String(err);
    throw new ExpressionError(message, source);
  }
}

/** Parses an expression once; the result can be evaluated many times. */
export function compileExpression(source: string): CompiledExpression {
  const ast = parseCached(source);
  return {
    source,
    evaluate: (scope = {}, options = {}) => execute(ast, source, scope, options),
  };
}

/** Parses and evaluates an expression. Throws `ExpressionError` on failure. */
export function evaluateExpression(source: string, scope: ExpressionScope = {}, options: EvaluateOptions = {}): unknown {
  return compileExpression(source).evaluate(scope, options);
}

/** Returns null when the expression is syntactically valid, otherwise an error message. */
export function checkExpression(source: string): string | null {
  try {
    parseCached(source);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export interface TextEvaluateOptions extends EvaluateOptions {
  /** Converts each interpolated value to text. Defaults to `toDisplayString`. */
  stringify?: (value: unknown) => string;
}

export interface CompiledText {
  readonly source: string;
  readonly parts: readonly TextPart[];
  /** True when the text has no placeholders. */
  readonly isStatic: boolean;
  /** True when the text is exactly one placeholder, e.g. "{{ row.total }}". */
  readonly isSingleExpression: boolean;
  /** Evaluates placeholders and concatenates the result. */
  evaluate(scope?: ExpressionScope, options?: TextEvaluateOptions): string;
  /** The raw value for single-expression text, otherwise the evaluated string. */
  evaluateValue(scope?: ExpressionScope, options?: EvaluateOptions): unknown;
}

/** Compiles text with `{{ expression }}` placeholders. Throws `ExpressionError` on syntax errors. */
export function compileText(text: string): CompiledText {
  let parts: TextPart[];
  try {
    parts = splitPlaceholders(text);
  } catch (err) {
    throw new ExpressionError((err as Error).message, text);
  }
  const compiled = parts.map((p) => (p.kind === 'expression' ? compileExpression(p.source) : p.value));
  const isStatic = parts.every((p) => p.kind === 'text');
  const isSingleExpression = parts.length === 1 && parts[0]!.kind === 'expression';

  const evaluate = (scope: ExpressionScope = {}, options: TextEvaluateOptions = {}): string => {
    const stringify = options.stringify ?? toDisplayString;
    let out = '';
    for (const part of compiled) out += typeof part === 'string' ? part : stringify(part.evaluate(scope, options));
    return out;
  };

  return {
    source: text,
    parts,
    isStatic,
    isSingleExpression,
    evaluate,
    evaluateValue: (scope = {}, options = {}) =>
      isSingleExpression ? (compiled[0] as CompiledExpression).evaluate(scope, options) : evaluate(scope, options),
  };
}
