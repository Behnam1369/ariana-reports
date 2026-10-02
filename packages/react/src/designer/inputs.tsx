import { useEffect, useId, useState, type ReactNode } from 'react';
import { checkExpression, compileText } from '@ariana-report/core';

interface FieldProps {
  label: string;
  children: (id: string) => ReactNode;
  full?: boolean;
}

/** Label + control row. */
export function Field({ label, children, full }: FieldProps) {
  const id = useId();
  return (
    <div className={`ar-field${full ? ' ar-field-full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

/** Text input that commits on blur or Enter, so typing does not flood the undo history. */
export function TextInput({
  id,
  value,
  onCommit,
  placeholder,
  validate,
  multiline,
  list,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  /** Returns an error message, or null when valid. Invalid values are still committed. */
  validate?: (value: string) => string | null;
  multiline?: boolean;
  list?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = validate && draft !== '' ? validate(draft) : null;
  const errorId = useId();
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    id,
    value: draft,
    placeholder,
    'aria-label': ariaLabel,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onBlur: commit,
  };
  return (
    <>
      {multiline ? (
        <textarea
          {...common}
          className="ar-textarea"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
            if (e.key === 'Escape') setDraft(value);
          }}
        />
      ) : (
        <input
          {...common}
          className="ar-input"
          list={list}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(value);
          }}
        />
      )}
      {error && (
        <span id={errorId} className="ar-field-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/** Number input that commits on blur or Enter. Empty input commits `undefined` when `optional`. */
export function NumberInput({
  id,
  value,
  onCommit,
  min,
  step = 'any',
  optional,
  ariaLabel,
}: {
  id?: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  min?: number;
  step?: number | 'any';
  optional?: boolean;
  ariaLabel?: string;
}) {
  const text = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const commit = () => {
    if (draft.trim() === '') {
      if (optional && value !== undefined) onCommit(undefined);
      else setDraft(text);
      return;
    }
    let n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(text);
      return;
    }
    if (min !== undefined) n = Math.max(min, n);
    if (n !== value) onCommit(n);
    else setDraft(text);
  };
  return (
    <input
      id={id}
      className="ar-input"
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      min={min}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(text);
      }}
    />
  );
}

export function SelectInput<T extends string>({
  id,
  value,
  options,
  onChange,
  allowEmpty,
  ariaLabel,
}: {
  id?: string;
  value: T | undefined;
  options: readonly (T | { value: T; label: string })[];
  onChange: (value: T | undefined) => void;
  allowEmpty?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      className="ar-select"
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : (e.target.value as T))}
    >
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="ar-check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Color picker with a clear button. Non-hex colors (rgba, #rgb) are shown but replaced on pick. */
export function ColorInput({ id, value, onChange, ariaLabel }: { id?: string; value: string | undefined; onChange: (v: string | undefined) => void; ariaLabel?: string }) {
  const short = value && /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value;
  return (
    <div className="ar-field-row">
      <input
        id={id}
        type="color"
        className="ar-input ar-input-color"
        aria-label={ariaLabel}
        value={short && HEX6.test(short) ? short : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="ar-hint">{value ?? 'none'}</span>
      {value !== undefined && (
        <button type="button" className="ar-btn" aria-label={`Clear ${ariaLabel ?? 'color'}`} onClick={() => onChange(undefined)}>
          ×
        </button>
      )}
    </div>
  );
}

/** Validation helpers for expression fields. */
export const validateExpression = (src: string): string | null => checkExpression(src);
export const validateText = (src: string): string | null => {
  try {
    compileText(src);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};
