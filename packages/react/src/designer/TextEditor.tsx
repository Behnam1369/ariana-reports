import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { EXPRESSION_SNIPPETS, findComponent, wrapSelection, type IconName, type TextComponent } from '@ariana-reports/core';
import { useDesignerContext } from './context';
import { CheckInput, validateText } from './inputs';
import { Icon } from '../Icon';

/**
 * Large editor for a text component's content: formatting buttons for
 * allowHtml markup, a searchable list of fields, variables and functions to
 * insert, and syntax checking. Changes are applied as one undo step.
 */
export function TextEditor({ componentId, onClose }: { componentId: string; onClose: () => void }) {
  const { controller, state, labels } = useDesignerContext();
  const found = findComponent(state.template, componentId);
  const component = found?.component.type === 'text' ? (found.component as TextComponent) : undefined;
  const [draft, setDraft] = useState(component?.text ?? '');
  const [allowHtml, setAllowHtml] = useState(!!component?.allowHtml);
  const [search, setSearch] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const errorId = useId();
  const bandId = found?.band.band.id;
  const names = useMemo(() => controller.completions(bandId), [controller, bandId, state.template]);

  useEffect(() => {
    const previous = textarea.current?.ownerDocument.activeElement as HTMLElement | null;
    textarea.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    if (!component) onClose();
  }, [component, onClose]);
  if (!component) return null;

  const error = draft !== '' ? validateText(draft) : null;
  const apply = () => {
    if (draft !== component.text || allowHtml !== !!component.allowHtml) {
      controller.updateComponent(componentId, { text: draft, allowHtml: allowHtml || undefined } as Partial<TextComponent>);
    }
    onClose();
  };

  /** Replaces the selection (or inserts at the caret) and keeps focus in the textarea. */
  const edit = (before: string, after = '') => {
    const el = textarea.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = wrapSelection(draft, start, end, before, after);
    setDraft(next.text);
    const restore = () => {
      el?.focus();
      el?.setSelectionRange(next.start, next.end);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
    else setTimeout(restore, 0);
  };
  const insertExpression = (expr: string) => edit(`{{ ${expr} }}`);
  const tag = (name: string) => {
    if (!allowHtml) setAllowHtml(true);
    edit(`<${name}>`, `</${name}>`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      apply();
    }
  };

  const q = search.trim().toLowerCase();
  const matches = (s: string) => q === '' || s.toLowerCase().includes(q);
  const formatButtons: [IconName, string, () => void][] = [
    ['bold', labels.insertBold, () => tag('b')],
    ['italic', labels.insertItalic, () => tag('i')],
    ['underline', labels.insertUnderline, () => tag('u')],
    ['strike', labels.insertStrike, () => tag('s')],
    ['lineBreak', labels.insertLineBreak, () => {
      if (!allowHtml) setAllowHtml(true);
      edit('<br>');
    }],
  ];

  return (
    <div
      className="ar-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ar-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="ar-modal-header">
          <h2 id={titleId}>{labels.editText}</h2>
          <span className="ar-hint">{component.name ?? component.id}</span>
          <span className="ar-spacer" />
          <button type="button" className="ar-btn ar-btn-icon" aria-label={labels.close} title={labels.close} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="ar-modal-body">
          <div className="ar-editor-main">
            <div className="ar-editor-toolbar" role="toolbar" aria-label={labels.textField}>
              {formatButtons.map(([icon, label, onClick]) => (
                <button key={icon} type="button" className="ar-btn ar-btn-icon ar-btn-sm" aria-label={label} title={label} onClick={onClick}>
                  <Icon name={icon} />
                </button>
              ))}
              <span className="ar-toolbar-sep" />
              <CheckInput label={labels.allowHtml} checked={allowHtml} onChange={setAllowHtml} />
            </div>
            <textarea
              ref={textarea}
              className="ar-textarea"
              aria-label={labels.textField}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error ? (
              <span id={errorId} className="ar-field-error" role="alert">
                {error}
              </span>
            ) : (
              <span className="ar-hint">{allowHtml ? labels.allowHtmlHint : labels.textHint}</span>
            )}
          </div>
          <aside className="ar-editor-side" aria-label={labels.insertExpression}>
            <input className="ar-input" type="search" aria-label={labels.search} placeholder={labels.search} value={search} onChange={(e) => setSearch(e.target.value)} />
            <h3 className="ar-panel-title">{labels.fieldsAndVariables}</h3>
            <ul className="ar-editor-list">
              {names.filter(matches).map((n) => (
                <li key={n}>
                  <button type="button" title={`{{ ${n} }}`} onClick={() => insertExpression(n)}>
                    {n}
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="ar-panel-title">{labels.functions}</h3>
            <ul className="ar-editor-list">
              {EXPRESSION_SNIPPETS.filter(matches).map((n) => (
                <li key={n}>
                  <button type="button" title={`{{ ${n} }}`} onClick={() => insertExpression(n)}>
                    {n}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="ar-modal-footer">
          <span className="ar-hint">{labels.textEditorHint}</span>
          <span className="ar-spacer" />
          <button type="button" className="ar-btn ar-btn-outline" onClick={onClose}>
            {labels.cancel}
          </button>
          <button type="button" className="ar-btn ar-btn-primary" onClick={apply}>
            {labels.apply}
          </button>
        </div>
      </div>
    </div>
  );
}
