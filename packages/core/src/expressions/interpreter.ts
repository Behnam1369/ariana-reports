import type { Node } from './ast';
import { ExpressionError } from './errors';
import { resolveMethod } from './methods';
import {
  checkStringLength,
  DENIED_PROPERTIES,
  describeValue,
  isTrusted,
  markTrusted,
  propertyKey,
  readProperty,
  runtimeError,
} from './safety';

export const DEFAULT_MAX_STEPS = 1_000_000;
export const DEFAULT_MAX_DEPTH = 100;

export interface InterpreterContext {
  source: string;
  scope: Readonly<Record<string, unknown>>;
  /** Host-registered functions. */
  functions: Readonly<Record<string, unknown>> | undefined;
  /** Built-in functions and constants. */
  builtins: Readonly<Record<string, unknown>>;
  maxSteps: number;
  maxDepth: number;
  steps: number;
  depth: number;
}

interface Env {
  vars: Map<string, unknown>;
  parent: Env | null;
}

/** Marks a short-circuited optional chain (`a?.b` with nullish `a`). */
const SHORT = Symbol('short-circuit');

export function run(node: Node, ctx: InterpreterContext): unknown {
  return value(node, null, ctx);
}

function value(node: Node, env: Env | null, ctx: InterpreterContext): unknown {
  const v = evaluate(node, env, ctx);
  return v === SHORT ? undefined : v;
}

function tick(ctx: InterpreterContext): void {
  if (++ctx.steps > ctx.maxSteps) {
    throw runtimeError(`Expression exceeded the limit of ${ctx.maxSteps} evaluation steps`);
  }
}

function lookupIdentifier(name: string, env: Env | null, ctx: InterpreterContext): unknown {
  for (let e = env; e; e = e.parent) {
    if (e.vars.has(name)) return e.vars.get(name);
  }
  if (DENIED_PROPERTIES.has(name)) throw runtimeError(`Access to "${name}" is not allowed`);
  if (Object.hasOwn(ctx.scope, name)) {
    const v = ctx.scope[name];
    if (typeof v === 'function' && !isTrusted(v)) {
      throw runtimeError(`"${name}" is a function in the scope; register it with the "functions" option instead`);
    }
    return v;
  }
  if (ctx.functions && Object.hasOwn(ctx.functions, name)) {
    const fn = ctx.functions[name];
    if (typeof fn === 'function') markTrusted(fn);
    return fn;
  }
  if (Object.hasOwn(ctx.builtins, name)) return ctx.builtins[name];
  throw runtimeError(`"${name}" is not defined`);
}

function evaluate(node: Node, env: Env | null, ctx: InterpreterContext): unknown {
  tick(ctx);
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier':
      return lookupIdentifier(node.name, env, ctx);

    case 'Template': {
      let out = node.quasis[0] ?? '';
      for (let i = 0; i < node.expressions.length; i++) {
        const v = value(node.expressions[i]!, env, ctx);
        out = checkStringLength(out + stringify(v) + (node.quasis[i + 1] ?? ''));
      }
      return out;
    }

    case 'Array':
      return node.elements.map((el) => value(el, env, ctx));

    case 'Object': {
      const obj: Record<string, unknown> = {};
      for (const { key, value: v } of node.properties) {
        Object.defineProperty(obj, key, { value: value(v, env, ctx), enumerable: true, writable: true, configurable: true });
      }
      return obj;
    }

    case 'Member': {
      const target = evaluate(node.object, env, ctx);
      if (target === SHORT) return SHORT;
      if (node.optional && (target === null || target === undefined)) return SHORT;
      const key = node.computed ? value(node.property, env, ctx) : (node.property as { value: string }).value;
      return readProperty(target, key);
    }

    case 'Call':
      return call(node, env, ctx);

    case 'Unary': {
      // typeof on an undefined identifier yields "undefined", as in JavaScript.
      if (node.operator === 'typeof') {
        if (node.argument.type === 'Identifier') {
          try {
            return typeof value(node.argument, env, ctx);
          } catch (err) {
            if (err instanceof ExpressionError && /is not defined/.test(err.message)) return 'undefined';
            throw err;
          }
        }
        return typeof value(node.argument, env, ctx);
      }
      const v = value(node.argument, env, ctx);
      switch (node.operator) {
        case '!':
          return !v;
        case '-':
          return -(v as number);
        case '+':
          return +(v as number);
      }
      break;
    }

    case 'Binary': {
      const l = value(node.left, env, ctx) as any;
      const r = value(node.right, env, ctx) as any;
      switch (node.operator) {
        case '+': {
          const result = l + r;
          return typeof result === 'string' ? checkStringLength(result) : result;
        }
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '%':
          return l % r;
        case '**':
          return l ** r;
        case '==':
          return l == r;
        case '!=':
          return l != r;
        case '===':
          return l === r;
        case '!==':
          return l !== r;
        case '<':
          return l < r;
        case '<=':
          return l <= r;
        case '>':
          return l > r;
        case '>=':
          return l >= r;
      }
      break;
    }

    case 'Logical': {
      const l = value(node.left, env, ctx);
      switch (node.operator) {
        case '&&':
          return l ? value(node.right, env, ctx) : l;
        case '||':
          return l ? l : value(node.right, env, ctx);
        case '??':
          return l ?? value(node.right, env, ctx);
      }
      break;
    }

    case 'Conditional':
      return value(node.test, env, ctx) ? value(node.consequent, env, ctx) : value(node.alternate, env, ctx);

    case 'Arrow':
      return makeLambda(node.params, node.body, env, ctx);
  }
  throw runtimeError(`Unsupported expression node`);
}

function call(node: Extract<Node, { type: 'Call' }>, env: Env | null, ctx: InterpreterContext): unknown {
  const callee = node.callee;

  if (callee.type === 'Member') {
    const target = evaluate(callee.object, env, ctx);
    if (target === SHORT) return SHORT;
    if (callee.optional && (target === null || target === undefined)) return SHORT;
    const name = propertyKey(callee.computed ? value(callee.property, env, ctx) : (callee.property as { value: string }).value);
    if (target === null || target === undefined) {
      throw runtimeError(`Cannot call "${name}" on ${target === null ? 'null' : 'undefined'}`);
    }
    if (DENIED_PROPERTIES.has(name)) throw runtimeError(`Access to "${name}" is not allowed`);

    const method = resolveMethod(target, name);
    if (method) return method(evalArgs(node, env, ctx));

    // Trusted functions stored as own properties, e.g. Math.round or { f: x => x }.f
    let fn: unknown;
    if (typeof target === 'object' && !Array.isArray(target) && !(target instanceof Date)) {
      fn = readProperty(target, name);
    }
    if ((fn === null || fn === undefined) && node.optional) return SHORT;
    if (!isTrusted(fn)) {
      throw runtimeError(`"${name}" is not an allowed method on ${describeValue(target)}`);
    }
    return fn(...evalArgs(node, env, ctx));
  }

  const fn = evaluate(callee, env, ctx);
  if (fn === SHORT) return SHORT;
  if ((fn === null || fn === undefined) && node.optional) return SHORT;
  if (!isTrusted(fn)) {
    const label = callee.type === 'Identifier' ? `"${callee.name}"` : 'value';
    throw runtimeError(`${label} is not a function`);
  }
  return fn(...evalArgs(node, env, ctx));
}

function evalArgs(node: Extract<Node, { type: 'Call' }>, env: Env | null, ctx: InterpreterContext): unknown[] {
  return node.args.map((a) => value(a, env, ctx));
}

function makeLambda(params: string[], body: Node, env: Env | null, ctx: InterpreterContext): Function {
  const fn = (...args: unknown[]) => {
    if (++ctx.depth > ctx.maxDepth) {
      ctx.depth--;
      throw runtimeError(`Expression exceeded the maximum call depth of ${ctx.maxDepth}`);
    }
    try {
      const vars = new Map<string, unknown>();
      params.forEach((p, i) => vars.set(p, args[i]));
      return value(body, { vars, parent: env }, ctx);
    } finally {
      ctx.depth--;
    }
  };
  return markTrusted(fn);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'function') return '[function]';
  return String(v);
}
