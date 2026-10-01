/** Raised for syntax errors, disallowed operations and runtime failures in expressions. */
export class ExpressionError extends Error {
  /** Source of the expression that failed. */
  readonly source: string;
  /** Character offset in `source`, for syntax errors. */
  readonly position: number | undefined;

  constructor(message: string, source: string, position?: number) {
    super(position === undefined ? message : `${message} (at position ${position})`);
    this.name = 'ExpressionError';
    this.source = source;
    this.position = position;
  }
}
