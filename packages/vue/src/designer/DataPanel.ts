import { defineComponent, h, ref, type PropType, type VNode } from 'vue';
import { COMPONENT_TYPES, FIELD_TYPES, findBand, type FieldDefinition, type FieldType } from '@ariana-reports/core';
import { useDesignerContext, writePayload } from './context';
import { CheckInput, field, NumberInput, panelSection, SelectInput, TextInput } from './inputs';
import { icon } from '../Icon';

export const Toolbox = defineComponent({
  name: 'ArToolbox',
  setup() {
    const { controller, state, labels } = useDesignerContext();
    const target = () => {
      const s = state.value;
      if (s.selection.bandId) return s.selection.bandId;
      const sections = controller.sections();
      return sections.find((x) => x.role === 'detail')?.band.id ?? sections[0]?.band.id ?? null;
    };
    return () =>
      panelSection(labels.value.components, [
        h(
          'div',
          { class: 'ar-toolbox' },
          COMPONENT_TYPES.map((type) =>
            h(
              'button',
              {
                key: type,
                type: 'button',
                class: 'ar-toolbox-item',
                draggable: 'true',
                onDragstart: (e: DragEvent) => writePayload(e.dataTransfer, { kind: 'component', type }),
                onClick: () => {
                  const id = target();
                  if (id) controller.addComponent(id, type);
                },
              },
              [icon(type), labels.value[type]],
            ),
          ),
        ),
      ]);
  },
});

const FieldTree = defineComponent({
  name: 'ArFieldTree',
  props: {
    fields: { type: Array as PropType<FieldDefinition[]>, required: true },
    root: { type: String, required: true },
    path: { type: Array as PropType<string[]>, default: () => [] },
  },
  setup(props) {
    const { controller, state, labels } = useDesignerContext();
    return (): VNode =>
      h(
        'ul',
        { class: ['ar-tree', props.path.length === 0 && 'ar-tree-root'], role: props.path.length === 0 ? 'tree' : 'group' },
        props.fields.map((f) => {
          const fieldPath = [...props.path, f.name];
          const insert = () => {
            const bandId = state.value.selection.bandId;
            if (bandId && findBand(state.value.template, bandId)) controller.insertField(bandId, fieldPath, undefined, props.root);
          };
          return h('li', { key: f.name, role: 'treeitem', 'aria-selected': 'false' }, [
            h(
              'div',
              {
                class: 'ar-tree-item',
                draggable: 'true',
                tabindex: 0,
                title: labels.value.fieldHint,
                onDragstart: (e: DragEvent) => writePayload(e.dataTransfer, { kind: 'field', root: props.root, path: fieldPath }),
                onDblclick: insert,
                onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && insert(),
              },
              [icon('field'), h('span', f.name), h('span', { class: 'ar-tree-type' }, f.type)],
            ),
            f.fields?.length && f.type === 'object' ? h(FieldTree, { fields: f.fields, root: props.root, path: fieldPath }) : null,
            f.fields?.length && f.type === 'array' ? h(FieldTree, { fields: f.fields, root: 'row', path: [] }) : null,
          ]);
        }),
      );
  },
});

function addForm(label: string, placeholder: string, button: string, onAdd: (name: string) => void, name: { value: string }, error: { value: string | null }): VNode[] {
  return [
    h(
      'form',
      {
        class: 'ar-field-row',
        style: { marginTop: '8px' },
        onSubmit: (e: Event) => {
          e.preventDefault();
          const n = name.value.trim();
          if (!n) return;
          try {
            onAdd(n);
            name.value = '';
            error.value = null;
          } catch (err) {
            error.value = (err as Error).message;
          }
        },
      },
      [
        h('input', { class: 'ar-input', 'aria-label': label, placeholder, value: name.value, onInput: (e: Event) => (name.value = (e.target as HTMLInputElement).value) }),
        h('button', { type: 'submit', class: 'ar-btn ar-btn-outline' }, [icon('plus'), button]),
      ],
    ),
    error.value ? h('p', { class: 'ar-field-error', role: 'alert' }, error.value) : (null as unknown as VNode),
  ];
}

export const DataPanel = defineComponent({
  name: 'ArDataPanel',
  setup() {
    const { controller, state, labels } = useDesignerContext();
    const name = ref('');
    const error = ref<string | null>(null);
    return () => {
      const l = labels.value;
      const hasSample = controller.getSampleData() !== undefined;
      return panelSection(l.data, [
        ...state.value.template.dataSources.map((ds) =>
          h('details', { key: ds.name, class: 'ar-source', open: true }, [
            h('summary', [icon('database'), h('span', ds.name)]),
            h('div', { class: 'ar-source-body' }, [
            field(l.sourceName, (id) => h(TextInput, { id, value: ds.name, onCommit: (v: string) => v && controller.updateDataSource(ds.name, { name: v }) })),
            field(l.sourcePath, (id) =>
              h(TextInput, { id, value: ds.path ?? '', placeholder: ds.name, onCommit: (v: string) => controller.updateDataSource(ds.name, { path: v || undefined }) }),
            ),
            h('div', { class: 'ar-field-row' }, [
              hasSample ? h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.inferDataSourceFields(ds.name) }, l.inferFields) : null,
              h('button', { type: 'button', class: 'ar-btn ar-btn-danger', 'aria-label': `${l.delete} ${ds.name}`, onClick: () => controller.removeDataSource(ds.name) }, l.delete),
            ]),
            ds.fields?.length ? h(FieldTree, { fields: ds.fields, root: 'row' }) : h('p', { class: 'ar-hint' }, l.noFields),
            ]),
          ]),
        ),
        ...addForm(
          l.newDataSourceName,
          l.namePlaceholder,
          l.addDataSource,
          (n) => {
            controller.addDataSource({ name: n });
            if (hasSample) controller.inferDataSourceFields(n);
          },
          name,
          error,
        ),
      ]);
    };
  },
});

export const ParametersPanel = defineComponent({
  name: 'ArParametersPanel',
  setup() {
    const { controller, state, labels } = useDesignerContext();
    const name = ref('');
    const error = ref<string | null>(null);
    return () => {
      const l = labels.value;
      return panelSection(l.parameters, [
        ...(state.value.template.parameters ?? []).map((p) =>
          h('details', { key: p.name, class: 'ar-source' }, [
            h('summary', [icon('parameter'), h('span', `params.${p.name}`)]),
            h('div', { class: 'ar-source-body' }, [
            field(l.parameterLabel, (id) => h(TextInput, { id, value: p.label ?? '', onCommit: (v: string) => controller.updateParameter(p.name, { label: v || undefined }) })),
            field(l.parameterType, (id) =>
              h(SelectInput, { id, value: p.type, options: FIELD_TYPES, translate: true, onChange: (v?: string) => v && controller.updateParameter(p.name, { type: v as FieldType }) }),
            ),
            field(l.defaultValue, (id) =>
              p.type === 'number'
                ? h(NumberInput, {
                    id,
                    optional: true,
                    value: typeof p.defaultValue === 'number' ? p.defaultValue : undefined,
                    onCommit: (v?: number) => controller.updateParameter(p.name, { defaultValue: v }),
                  })
                : p.type === 'boolean'
                  ? h(CheckInput, { label: 'true', checked: p.defaultValue === true, onChange: (v: boolean) => controller.updateParameter(p.name, { defaultValue: v }) })
                  : h(TextInput, {
                      id,
                      value: p.defaultValue === undefined || p.defaultValue === null ? '' : String(p.defaultValue),
                      onCommit: (v: string) => controller.updateParameter(p.name, { defaultValue: v === '' ? undefined : v }),
                    }),
            ),
            h('button', { type: 'button', class: 'ar-btn ar-btn-danger', 'aria-label': `${l.delete} params.${p.name}`, onClick: () => controller.removeParameter(p.name) }, l.delete),
            ]),
          ]),
        ),
        ...addForm(l.newParameterName, l.namePlaceholder, l.addParameter, (n) => controller.addParameter({ name: n, type: 'string' }), name, error),
      ]);
    };
  },
});
