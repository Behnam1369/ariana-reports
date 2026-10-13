import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { EXPRESSION_SNIPPETS, findComponent, wrapSelection, type IconName, type TextComponent } from '@ariana-reports/core';
import { useDesignerContext } from './context';
import { CheckInput, validateText } from './inputs';
import { icon } from '../Icon';

/**
 * Large editor for a text component's content: formatting buttons for
 * allowHtml markup, a searchable list of fields, variables and functions to
 * insert, and syntax checking. Changes are applied as one undo step.
 */
export const TextEditor = defineComponent({
  name: 'ArTextEditor',
  props: { componentId: { type: String, required: true } },
  emits: { close: () => true },
  setup(props, { emit }) {
    const { controller, state, labels } = useDesignerContext();
    const found = () => findComponent(state.value.template, props.componentId);
    const component = computed(() => {
      const f = found();
      return f?.component.type === 'text' ? (f.component as TextComponent) : undefined;
    });
    const draft = ref(component.value?.text ?? '');
    const allowHtml = ref(!!component.value?.allowHtml);
    const search = ref('');
    const textarea = ref<HTMLTextAreaElement>();
    const titleId = useId();
    const errorId = useId();
    let previous: HTMLElement | null = null;
    const close = () => emit('close');

    onMounted(() => {
      previous = (textarea.value?.ownerDocument.activeElement as HTMLElement | null) ?? null;
      textarea.value?.focus();
    });
    onBeforeUnmount(() => previous?.focus?.());
    watch(component, (c) => !c && close());

    const apply = () => {
      const c = component.value;
      if (c && (draft.value !== c.text || allowHtml.value !== !!c.allowHtml)) {
        controller.updateComponent(props.componentId, { text: draft.value, allowHtml: allowHtml.value || undefined } as Partial<TextComponent>);
      }
      close();
    };
    const edit = (before: string, after = '') => {
      const el = textarea.value;
      const start = el?.selectionStart ?? draft.value.length;
      const end = el?.selectionEnd ?? draft.value.length;
      const next = wrapSelection(draft.value, start, end, before, after);
      draft.value = next.text;
      void nextTick(() => {
        el?.focus();
        el?.setSelectionRange(next.start, next.end);
      });
    };
    const insertExpression = (expr: string) => edit(`{{ ${expr} }}`);
    const tag = (name: string) => {
      allowHtml.value = true;
      edit(`<${name}>`, `</${name}>`);
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        apply();
      }
    };

    return () => {
      const c = component.value;
      if (!c) return null;
      const l = labels.value;
      const error = draft.value !== '' ? validateText(draft.value) : null;
      const q = search.value.trim().toLowerCase();
      const matches = (s: string) => q === '' || s.toLowerCase().includes(q);
      const names = controller.completions(found()?.band.band.id).filter(matches);
      const formatButtons: [IconName, string, () => void][] = [
        ['bold', l.insertBold, () => tag('b')],
        ['italic', l.insertItalic, () => tag('i')],
        ['underline', l.insertUnderline, () => tag('u')],
        ['strike', l.insertStrike, () => tag('s')],
        [
          'lineBreak',
          l.insertLineBreak,
          () => {
            allowHtml.value = true;
            edit('<br>');
          },
        ],
      ];
      const list = (items: readonly string[]) =>
        h(
          'ul',
          { class: 'ar-editor-list' },
          items.map((n) => h('li', { key: n }, [h('button', { type: 'button', title: `{{ ${n} }}`, onClick: () => insertExpression(n) }, n)])),
        );

      return h(
        'div',
        {
          class: 'ar-modal-backdrop',
          onMousedown: (e: MouseEvent) => {
            if (e.target === e.currentTarget) close();
          },
        },
        [
          h('div', { class: 'ar-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, onKeydown }, [
            h('div', { class: 'ar-modal-header' }, [
              h('h2', { id: titleId }, l.editText),
              h('span', { class: 'ar-hint' }, c.name ?? c.id),
              h('span', { class: 'ar-spacer' }),
              h('button', { type: 'button', class: 'ar-btn ar-btn-icon', 'aria-label': l.close, title: l.close, onClick: close }, [icon('close')]),
            ]),
            h('div', { class: 'ar-modal-body' }, [
              h('div', { class: 'ar-editor-main' }, [
                h('div', { class: 'ar-editor-toolbar', role: 'toolbar', 'aria-label': l.textField }, [
                  ...formatButtons.map(([name, label, onClick]) =>
                    h('button', { key: name, type: 'button', class: 'ar-btn ar-btn-icon ar-btn-sm', 'aria-label': label, title: label, onClick }, [icon(name)]),
                  ),
                  h('span', { class: 'ar-toolbar-sep' }),
                  h(CheckInput, { label: l.allowHtml, checked: allowHtml.value, onChange: (v: boolean) => (allowHtml.value = v) }),
                ]),
                h('textarea', {
                  ref: textarea,
                  class: 'ar-textarea',
                  'aria-label': l.textField,
                  'aria-invalid': error ? 'true' : undefined,
                  'aria-describedby': error ? errorId : undefined,
                  spellcheck: 'false',
                  value: draft.value,
                  onInput: (e: Event) => (draft.value = (e.target as HTMLTextAreaElement).value),
                }),
                error
                  ? h('span', { id: errorId, class: 'ar-field-error', role: 'alert' }, error)
                  : h('span', { class: 'ar-hint' }, allowHtml.value ? l.allowHtmlHint : l.textHint),
              ]),
              h('aside', { class: 'ar-editor-side', 'aria-label': l.insertExpression }, [
                h('input', {
                  class: 'ar-input',
                  type: 'search',
                  'aria-label': l.search,
                  placeholder: l.search,
                  value: search.value,
                  onInput: (e: Event) => (search.value = (e.target as HTMLInputElement).value),
                }),
                h('h3', { class: 'ar-panel-title' }, l.fieldsAndVariables),
                list(names),
                h('h3', { class: 'ar-panel-title' }, l.functions),
                list(EXPRESSION_SNIPPETS.filter(matches)),
              ]),
            ]),
            h('div', { class: 'ar-modal-footer' }, [
              h('span', { class: 'ar-hint' }, l.textEditorHint),
              h('span', { class: 'ar-spacer' }),
              h('button', { type: 'button', class: 'ar-btn ar-btn-outline', onClick: close }, l.cancel),
              h('button', { type: 'button', class: 'ar-btn ar-btn-primary', onClick: apply }, l.apply),
            ]),
          ]),
        ],
      );
    };
  },
});
