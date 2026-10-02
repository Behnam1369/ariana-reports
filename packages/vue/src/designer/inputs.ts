import { defineComponent, h, ref, useId, watch, type PropType, type VNode } from 'vue';
import { checkExpression, compileText } from '@ariana-report/core';

export const validateExpression = (src: string): string | null => checkExpression(src);
export const validateText = (src: string): string | null => {
  try {
    compileText(src);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

/** Label + control row. The default slot receives `{ id }` for the control. */
export const Field = defineComponent({
  name: 'ArField',
  props: { label: { type: String, required: true }, full: Boolean },
  setup(props, { slots }) {
    const id = useId();
    return () =>
      h('div', { class: ['ar-field', props.full && 'ar-field-full'] }, [h('label', { for: id }, props.label), slots.default?.({ id })]);
  },
});

/** Shorthand: `field('Name', (id) => h(TextInput, { id, ... }))`. */
export function field(label: string, control: (id: string) => VNode | VNode[], full = false): VNode {
  return h(Field, { label, full }, { default: ({ id }: { id: string }) => control(id) });
}

/** Text input that commits on blur or Enter, so typing does not flood the undo history. */
export const TextInput = defineComponent({
  name: 'ArTextInput',
  props: {
    id: String,
    value: { type: String, required: true },
    placeholder: String,
    validate: Function as PropType<(v: string) => string | null>,
    multiline: Boolean,
    list: String,
    ariaLabel: String,
  },
  emits: { commit: (_v: string) => true },
  setup(props, { emit }) {
    const draft = ref(props.value);
    const errorId = useId();
    watch(
      () => props.value,
      (v) => (draft.value = v),
    );
    const commit = () => {
      if (draft.value !== props.value) emit('commit', draft.value);
    };
    return () => {
      const error = props.validate && draft.value !== '' ? props.validate(draft.value) : null;
      const common = {
        id: props.id,
        value: draft.value,
        placeholder: props.placeholder,
        'aria-label': props.ariaLabel,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? errorId : undefined,
        onInput: (e: Event) => (draft.value = (e.target as HTMLInputElement).value),
        onBlur: commit,
      };
      const control = props.multiline
        ? h('textarea', {
            ...common,
            class: 'ar-textarea',
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
              if (e.key === 'Escape') draft.value = props.value;
            },
          })
        : h('input', {
            ...common,
            class: 'ar-input',
            list: props.list,
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') draft.value = props.value;
            },
          });
      return [control, error ? h('span', { id: errorId, class: 'ar-field-error', role: 'alert' }, error) : null];
    };
  },
});

/** Number input that commits on blur or Enter. Empty input commits `undefined` when `optional`. */
export const NumberInput = defineComponent({
  name: 'ArNumberInput',
  props: {
    id: String,
    value: { type: Number as PropType<number | undefined> },
    min: Number,
    step: { type: [Number, String] as PropType<number | 'any'>, default: 'any' },
    optional: Boolean,
    ariaLabel: String,
  },
  emits: { commit: (_v: number | undefined) => true },
  setup(props, { emit }) {
    const text = () => (props.value === undefined ? '' : String(props.value));
    const draft = ref(text());
    watch(() => props.value, () => (draft.value = text()));
    const commit = () => {
      if (draft.value.trim() === '') {
        if (props.optional && props.value !== undefined) emit('commit', undefined);
        else draft.value = text();
        return;
      }
      let n = Number(draft.value);
      if (!Number.isFinite(n)) {
        draft.value = text();
        return;
      }
      if (props.min !== undefined) n = Math.max(props.min, n);
      if (n !== props.value) emit('commit', n);
      else draft.value = text();
    };
    return () =>
      h('input', {
        id: props.id,
        class: 'ar-input',
        type: 'number',
        inputmode: 'decimal',
        'aria-label': props.ariaLabel,
        min: props.min,
        step: props.step,
        value: draft.value,
        onInput: (e: Event) => (draft.value = (e.target as HTMLInputElement).value),
        onBlur: commit,
        onKeydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') draft.value = text();
        },
      });
  },
});

type Option = string | { value: string; label: string };

export const SelectInput = defineComponent({
  name: 'ArSelectInput',
  props: {
    id: String,
    value: { type: String as PropType<string | undefined> },
    options: { type: Array as PropType<readonly Option[]>, required: true },
    allowEmpty: String,
    ariaLabel: String,
  },
  emits: { change: (_v: string | undefined) => true },
  setup(props, { emit }) {
    return () => {
      const current = props.value ?? '';
      return h(
        'select',
        {
          id: props.id,
          class: 'ar-select',
          'aria-label': props.ariaLabel,
          value: current,
          onChange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            emit('change', v === '' ? undefined : v);
          },
        },
        [
          props.allowEmpty !== undefined ? h('option', { value: '', selected: current === '' }, props.allowEmpty) : null,
          ...props.options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return h('option', { key: opt.value, value: opt.value, selected: opt.value === current }, opt.label);
          }),
        ],
      );
    };
  },
});

export const CheckInput = defineComponent({
  name: 'ArCheckInput',
  props: { label: { type: String, required: true }, checked: Boolean },
  emits: { change: (_v: boolean) => true },
  setup(props, { emit }) {
    const id = useId();
    return () =>
      h('div', { class: 'ar-check' }, [
        h('input', { id, type: 'checkbox', checked: props.checked, onChange: (e: Event) => emit('change', (e.target as HTMLInputElement).checked) }),
        h('label', { for: id }, props.label),
      ]);
  },
});

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Color picker with a clear button. */
export const ColorInput = defineComponent({
  name: 'ArColorInput',
  props: { id: String, value: { type: String as PropType<string | undefined> }, ariaLabel: String },
  emits: { change: (_v: string | undefined) => true },
  setup(props, { emit }) {
    return () => {
      const v = props.value;
      const full = v && /^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
      return h('div', { class: 'ar-field-row' }, [
        h('input', {
          id: props.id,
          type: 'color',
          class: 'ar-input ar-input-color',
          'aria-label': props.ariaLabel,
          value: full && HEX6.test(full) ? full : '#000000',
          onInput: (e: Event) => emit('change', (e.target as HTMLInputElement).value),
        }),
        h('span', { class: 'ar-hint' }, v ?? 'none'),
        v !== undefined
          ? h('button', { type: 'button', class: 'ar-btn', 'aria-label': `Clear ${props.ariaLabel ?? 'color'}`, onClick: () => emit('change', undefined) }, '×')
          : null,
      ]);
    };
  },
});
