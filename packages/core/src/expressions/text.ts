export type TextPart = { kind: 'text'; value: string } | { kind: 'expression'; source: string };

/**
 * Splits text on `{{ expression }}` placeholders. `\{{` is a literal `{{`.
 * Throws an Error with a descriptive message for unterminated or empty placeholders.
 */
export function splitPlaceholders(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let literal = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && text.startsWith('{{', i + 1)) {
      literal += '{{';
      i += 3;
      continue;
    }
    if (text.startsWith('{{', i)) {
      const end = text.indexOf('}}', i + 2);
      if (end === -1) throw new Error('unterminated "{{" placeholder');
      const source = text.slice(i + 2, end).trim();
      if (source === '') throw new Error('empty "{{ }}" placeholder');
      if (literal) parts.push({ kind: 'text', value: literal });
      literal = '';
      parts.push({ kind: 'expression', source });
      i = end + 2;
      continue;
    }
    literal += text[i];
    i++;
  }
  if (literal) parts.push({ kind: 'text', value: literal });
  return parts;
}
