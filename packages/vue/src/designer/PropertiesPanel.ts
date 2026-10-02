import { defineComponent, h, ref, useId, type PropType, type VNode } from 'vue';
import {
  BORDER_LINE_STYLES,
  findBand,
  findRegion,
  FONT_STYLES,
  FONT_WEIGHTS,
  IMAGE_FITS,
  LINE_ORIENTATIONS,
  ORIENTATIONS,
  PAPER_SIZE_NAMES,
  SORT_DIRECTIONS,
  TEXT_ALIGNS,
  TEXT_DECORATIONS,
  UNITS,
  VERTICAL_ALIGNS,
  type Band,
  type BorderSpec,
  type DataRegion,
  type Group,
  type GroupSortDirection,
  type ReportComponent,
  type StyleProps,
  type Unit,
  type ValueFormat,
} from '@ariana-report/core';
import { useDesignerContext, type DesignerContext } from './context';
import { CheckInput, ColorInput, field, NumberInput, SelectInput, TextInput, validateExpression, validateText } from './inputs';

const FONT_FAMILIES = ['Helvetica', 'Times', 'Courier'];
const PAGE_BAND_LABELS = { reportHeader: 'Report header', pageHeader: 'Page header', pageFooter: 'Page footer', reportFooter: 'Report footer' } as const;
type Patch = Partial<Record<keyof StyleProps, unknown>>;

const section = (title: string, children: (VNode | null)[]) =>
  h('div', { class: 'ar-panel-section' }, [h('h3', { class: 'ar-panel-title' }, title), ...children]);

const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => h(CheckInput, { label, checked, onChange });

function patchStyle(base: StyleProps | undefined, patch: Patch): StyleProps | undefined {
  const style: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete style[k];
    else style[k] = v;
  }
  return Object.keys(style).length ? (style as StyleProps) : undefined;
}

/** Expression input with syntax checking and autocompletion. */
const ExpressionField = defineComponent({
  name: 'ArExpressionField',
  props: {
    label: { type: String, required: true },
    value: { type: String as PropType<string | undefined> },
    bandId: String,
    placeholder: String,
  },
  emits: { commit: (_v: string | undefined) => true },
  setup(props, { emit }) {
    const { controller } = useDesignerContext();
    const listId = useId();
    return () =>
      field(props.label, (id) => [
        h(TextInput, {
          id,
          value: props.value ?? '',
          list: listId,
          placeholder: props.placeholder,
          validate: validateExpression,
          onCommit: (v: string) => emit('commit', v.trim() === '' ? undefined : v),
        }),
        h('datalist', { id: listId }, controller.completions(props.bandId).map((c) => h('option', { key: c, value: c }))),
      ]);
  },
});

function styleEditor(style: StyleProps, onChange: (patch: Patch) => void, textProps: boolean, alignLabel: string): VNode[] {
  const border = style.border;
  const setBorder = (patch: Partial<BorderSpec> | null) => {
    if (patch === null) return onChange({ border: undefined });
    onChange({ border: { width: 0.5, color: '#000000', style: 'solid', ...border, ...patch } });
  };
  const out: VNode[] = [];
  if (textProps) {
    out.push(
      field('Font', (id) =>
        h(SelectInput, {
          id,
          value: style.fontFamily,
          options: [...new Set([...FONT_FAMILIES, ...(style.fontFamily ? [style.fontFamily] : [])])],
          allowEmpty: '(default)',
          onChange: (fontFamily?: string) => onChange({ fontFamily }),
        }),
      ),
      field('Size (pt)', (id) => h(NumberInput, { id, optional: true, min: 1, value: style.fontSize, onCommit: (fontSize?: number) => onChange({ fontSize }) })),
      field('Weight', (id) => h(SelectInput, { id, value: style.fontWeight, options: FONT_WEIGHTS, allowEmpty: '(default)', onChange: (fontWeight?: string) => onChange({ fontWeight }) })),
      field('Style', (id) => h(SelectInput, { id, value: style.fontStyle, options: FONT_STYLES, allowEmpty: '(default)', onChange: (fontStyle?: string) => onChange({ fontStyle }) })),
      field('Decoration', (id) =>
        h(SelectInput, { id, value: style.textDecoration, options: TEXT_DECORATIONS, allowEmpty: '(default)', onChange: (textDecoration?: string) => onChange({ textDecoration }) }),
      ),
      field('Color', (id) => h(ColorInput, { id, ariaLabel: 'Text color', value: style.color, onChange: (color?: string) => onChange({ color }) })),
      field(alignLabel, (id) => h(SelectInput, { id, value: style.textAlign, options: TEXT_ALIGNS, allowEmpty: '(default)', onChange: (textAlign?: string) => onChange({ textAlign }) })),
      field('Vertical', (id) =>
        h(SelectInput, { id, value: style.verticalAlign, options: VERTICAL_ALIGNS, allowEmpty: '(default)', onChange: (verticalAlign?: string) => onChange({ verticalAlign }) }),
      ),
      field('Padding', (id) =>
        h(NumberInput, { id, optional: true, min: 0, value: typeof style.padding === 'number' ? style.padding : undefined, onCommit: (padding?: number) => onChange({ padding }) }),
      ),
    );
  }
  out.push(
    field('Background', (id) => h(ColorInput, { id, ariaLabel: 'Background color', value: style.backgroundColor, onChange: (backgroundColor?: string) => onChange({ backgroundColor }) })),
    check('Border', !!border, (on) => setBorder(on ? {} : null)),
  );
  if (border) {
    const sides = border.sides ?? ['top', 'right', 'bottom', 'left'];
    out.push(
      field('Border width', (id) => h(NumberInput, { id, min: 0, value: border.width, onCommit: (width?: number) => setBorder({ width: width ?? 0 }) })),
      field('Border color', (id) => h(ColorInput, { id, ariaLabel: 'Border color', value: border.color, onChange: (color?: string) => setBorder({ color: color ?? '#000000' }) })),
      field('Border style', (id) => h(SelectInput, { id, value: border.style, options: BORDER_LINE_STYLES, onChange: (s?: string) => s && setBorder({ style: s as BorderSpec['style'] }) })),
      h(
        'div',
        { class: 'ar-field-row', role: 'group', 'aria-label': 'Border sides' },
        (['top', 'right', 'bottom', 'left'] as const).map((side) =>
          h(CheckInput, {
            key: side,
            label: side,
            checked: sides.includes(side),
            onChange: (on: boolean) => {
              const next = on ? [...sides, side] : sides.filter((s) => s !== side);
              setBorder({ sides: next.length === 4 ? undefined : next });
            },
          }),
        ),
      ),
    );
  }
  return out;
}

function formatEditor(format: ValueFormat | undefined, onChange: (f: ValueFormat | undefined) => void): VNode[] {
  const out: VNode[] = [
    field('Format', (id) =>
      h(SelectInput, {
        id,
        value: format?.type,
        options: ['number', 'currency', 'percent', 'date'],
        allowEmpty: '(none)',
        onChange: (t?: string) => {
          if (!t) return onChange(undefined);
          if (t === 'number') onChange({ type: 'number', decimals: 2, thousandsSeparator: true });
          if (t === 'currency') onChange({ type: 'currency', currency: 'USD' });
          if (t === 'percent') onChange({ type: 'percent', decimals: 0 });
          if (t === 'date') onChange({ type: 'date', pattern: 'yyyy-MM-dd' });
        },
      }),
    ),
  ];
  if (format && format.type !== 'date') {
    out.push(field('Decimals', (id) => h(NumberInput, { id, optional: true, min: 0, step: 1, value: format.decimals, onCommit: (decimals?: number) => onChange({ ...format, decimals } as ValueFormat) })));
  }
  if (format?.type === 'currency') {
    out.push(
      field('Currency', (id) =>
        h(TextInput, { id, value: format.currency, validate: (v: string) => (/^[A-Z]{3}$/.test(v) ? null : 'Use a 3-letter code such as USD'), onCommit: (currency: string) => onChange({ ...format, currency }) }),
      ),
    );
  }
  if (format?.type === 'number') out.push(check('Thousands separator', format.thousandsSeparator !== false, (thousandsSeparator) => onChange({ ...format, thousandsSeparator })));
  if (format?.type === 'date') out.push(field('Pattern', (id) => h(TextInput, { id, value: format.pattern, onCommit: (pattern: string) => pattern && onChange({ ...format, pattern }) })));
  return out;
}

const ComponentProperties = defineComponent({
  name: 'ArComponentProperties',
  props: { component: { type: Object as PropType<ReportComponent>, required: true }, bandId: { type: String, required: true } },
  setup(props) {
    const { controller, state, labels } = useDesignerContext();
    const styleName = ref('');
    const textList = useId();
    return () => {
      const c = props.component;
      const l = labels.value;
      const unit = state.value.template.unit;
      const update = (patch: Partial<ReportComponent>) => controller.updateComponent(c.id, patch);
      const styles = Object.keys(state.value.template.styles ?? {});
      const parts: VNode[] = [
        section(`${l[c.type]} (${c.id})`, [
          field('Name', (id) => h(TextInput, { id, value: c.name ?? '', onCommit: (name: string) => update({ name: name || undefined }) })),
          h(
            'div',
            { class: 'ar-field-grid', role: 'group', 'aria-label': `Position and size (${unit})` },
            (['x', 'y', 'width', 'height'] as const).map((k) =>
              h('label', { key: k, class: 'ar-hint' }, [`${k} (${unit})`, h(NumberInput, { min: 0, value: c[k], ariaLabel: `${k} (${unit})`, onCommit: (v?: number) => update({ [k]: v ?? 0 }) })]),
            ),
          ),
          check('Stretch to band height', !!c.growToHeight, (on) => update({ growToHeight: on || undefined })),
        ]),
      ];
      if (c.type === 'text') {
        parts.push(
          section('Content', [
            field(
              'Text',
              (id) => [
                h(TextInput, { id, multiline: true, value: c.text, validate: validateText, onCommit: (text: string) => update({ text } as Partial<ReportComponent>) }),
                h('datalist', { id: textList }, controller.completions(props.bandId).map((x) => h('option', { key: x, value: x }))),
              ],
              true,
            ),
            h('p', { class: 'ar-hint' }, 'Use {{ expression }} for data, e.g. {{ row.total }} or {{ sum(rows, r => r.total) }}.'),
            ...formatEditor(c.format, (format) => update({ format } as Partial<ReportComponent>)),
            check('Grow to fit text', !!c.canGrow, (canGrow) => update({ canGrow: canGrow || undefined } as Partial<ReportComponent>)),
            check('Word wrap', c.wordWrap !== false, (w) => update({ wordWrap: w ? undefined : false } as Partial<ReportComponent>)),
          ]),
        );
      }
      if (c.type === 'image') {
        parts.push(
          section('Image', [
            field('Source', (id) =>
              h(TextInput, { id, value: c.src, validate: validateText, placeholder: 'https://… or data:image/png;base64,…', onCommit: (src: string) => update({ src } as Partial<ReportComponent>) }),
            ),
            field('Fit', (id) => h(SelectInput, { id, value: c.fit ?? 'contain', options: IMAGE_FITS, onChange: (fit?: string) => update({ fit } as Partial<ReportComponent>) })),
          ]),
        );
      }
      if (c.type === 'line') {
        parts.push(
          section('Line', [
            field('Orientation', (id) =>
              h(SelectInput, {
                id,
                value: c.orientation,
                options: LINE_ORIENTATIONS,
                onChange: (o?: string) => {
                  if (!o || o === c.orientation) return;
                  const length = c.orientation === 'horizontal' ? c.width : c.height;
                  update({ orientation: o, width: o === 'horizontal' ? length : 0, height: o === 'vertical' ? length : 0 } as Partial<ReportComponent>);
                },
              }),
            ),
            h('p', { class: 'ar-hint' }, 'Line width, color and style come from the border settings below.'),
          ]),
        );
      }
      if (c.type === 'rectangle') {
        parts.push(
          section('Rectangle', [
            field(`Radius (${unit})`, (id) => h(NumberInput, { id, optional: true, min: 0, value: c.cornerRadius, onCommit: (cornerRadius?: number) => update({ cornerRadius } as Partial<ReportComponent>) })),
          ]),
        );
      }
      parts.push(
        section('Style', [
          field('Named style', (id) => h(SelectInput, { id, value: c.styleName, options: styles, allowEmpty: '(none)', onChange: (name?: string) => update({ styleName: name }) })),
          ...styleEditor(c.style ?? {}, (patch) => controller.updateComponentStyle(patch, [c.id]), c.type === 'text', l.align),
          h(
            'form',
            {
              class: 'ar-field-row',
              onSubmit: (e: Event) => {
                e.preventDefault();
                const name = styleName.value.trim();
                if (!name || !c.style) return;
                controller.setStyle(name, c.style);
                controller.updateComponent(c.id, { styleName: name, style: undefined });
                styleName.value = '';
              },
            },
            [
              h('input', { class: 'ar-input', 'aria-label': 'New style name', placeholder: 'style name', value: styleName.value, onInput: (e: Event) => (styleName.value = (e.target as HTMLInputElement).value) }),
              h('button', { type: 'submit', class: 'ar-btn', disabled: !c.style }, 'Save as style'),
            ],
          ),
        ]),
        section('Behavior', [
          h(ExpressionField, { label: 'Visible if', value: c.visible, bandId: props.bandId, placeholder: 'always', onCommit: (visible?: string) => update({ visible }) }),
          h('h4', { class: 'ar-panel-title' }, 'Conditional styles'),
          ...(c.conditions ?? []).map((cond, i) =>
            h('div', { key: i, class: 'ar-panel-section', style: { padding: '4px' } }, [
              h(ExpressionField, {
                label: 'When',
                value: cond.expression,
                bandId: props.bandId,
                onCommit: (expression?: string) => {
                  const conditions = [...(c.conditions ?? [])];
                  conditions[i] = { ...cond, expression: expression ?? 'true' };
                  update({ conditions });
                },
              }),
              ...styleEditor(
                cond.style,
                (patch) => {
                  const conditions = [...(c.conditions ?? [])];
                  conditions[i] = { ...cond, style: patchStyle(cond.style, patch) ?? {} };
                  update({ conditions });
                },
                c.type === 'text',
                l.align,
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'ar-btn ar-btn-danger',
                  onClick: () => {
                    const conditions = (c.conditions ?? []).filter((_, j) => j !== i);
                    update({ conditions: conditions.length ? conditions : undefined });
                  },
                },
                'Remove condition',
              ),
            ]),
          ),
          h('button', { type: 'button', class: 'ar-btn', onClick: () => update({ conditions: [...(c.conditions ?? []), { expression: 'true', style: { color: '#b91c1c' } }] }) }, 'Add condition'),
        ]),
      );
      return h('div', parts);
    };
  },
});

const RegionProperties = defineComponent({
  name: 'ArRegionProperties',
  props: { region: { type: Object as PropType<DataRegion>, required: true } },
  setup(props) {
    const { controller, state, labels } = useDesignerContext();
    const newGroup = ref('row.');
    const relation = ref('');
    return () => {
      const r = props.region;
      const l = labels.value;
      const isChild = !!findRegion(state.value.template, r.id)?.parent;
      const rules = r.sort ?? [];
      const setSort = (sort: DataRegion['sort']) => controller.updateRegion(r.id, { sort: sort && sort.length ? sort : undefined });
      const arrays = (controller.regionFields(r) ?? []).filter((f) => f.type === 'array').map((f) => f.name);
      const rel = relation.value || arrays[0] || '';
      const groupError = validateExpression(newGroup.value);
      return section(`Data band (${r.id})`, [
        !isChild || r.dataSource !== undefined
          ? field('Data source', (id) =>
              h(SelectInput, { id, value: r.dataSource, options: state.value.template.dataSources.map((d) => d.name), onChange: (dataSource?: string) => dataSource && controller.updateRegion(r.id, { dataSource }) }),
            )
          : field('Relation', (id) => h(TextInput, { id, value: r.relation ?? '', onCommit: (v: string) => v && controller.updateRegion(r.id, { relation: v }) })),
        h(ExpressionField, { label: 'Filter', value: r.filter, bandId: r.detail.id, placeholder: 'all rows', onCommit: (filter?: string) => controller.updateRegion(r.id, { filter }) }),
        h('h4', { class: 'ar-panel-title' }, 'Sort'),
        ...rules.map((rule, i) =>
          h('div', { key: i, class: 'ar-field-row' }, [
            h(TextInput, {
              ariaLabel: `Sort expression ${i + 1}`,
              value: rule.expression,
              validate: validateExpression,
              onCommit: (expression: string) => setSort(rules.map((x, j) => (j === i ? { ...x, expression } : x))),
            }),
            h(SelectInput, {
              ariaLabel: `Sort direction ${i + 1}`,
              value: rule.direction,
              options: SORT_DIRECTIONS,
              onChange: (d?: string) => d && setSort(rules.map((x, j) => (j === i ? { ...x, direction: d as 'asc' | 'desc' } : x))),
            }),
            h('button', { type: 'button', class: 'ar-btn', 'aria-label': `Remove sort ${i + 1}`, onClick: () => setSort(rules.filter((_, j) => j !== i)) }, '×'),
          ]),
        ),
        h('button', { type: 'button', class: 'ar-btn', onClick: () => setSort([...rules, { expression: 'row.id', direction: 'asc' }]) }, 'Add sort'),
        check('Show header', !!r.header, (on) => controller.setRegionBand(r.id, 'header', on)),
        check('Show footer', !!r.footer, (on) => controller.setRegionBand(r.id, 'footer', on)),
        check('Repeat header on each page', !!r.repeatHeaderOnEachPage, (on) => controller.updateRegion(r.id, { repeatHeaderOnEachPage: on || undefined })),
        h(
          'form',
          {
            class: 'ar-field-row',
            onSubmit: (e: Event) => {
              e.preventDefault();
              if (validateExpression(newGroup.value)) return;
              controller.addGroup(r.id, newGroup.value);
              newGroup.value = 'row.';
            },
          },
          [
            h('input', {
              class: 'ar-input',
              'aria-label': 'Group expression',
              value: newGroup.value,
              'aria-invalid': groupError ? 'true' : undefined,
              onInput: (e: Event) => (newGroup.value = (e.target as HTMLInputElement).value),
            }),
            h('button', { type: 'submit', class: 'ar-btn' }, l.addGroup),
          ],
        ),
        h(
          'form',
          {
            class: 'ar-field-row',
            onSubmit: (e: Event) => {
              e.preventDefault();
              if (rel) controller.addChildRegion(r.id, { relation: rel });
            },
          },
          [
            arrays.length
              ? h(SelectInput, { ariaLabel: 'Detail relation', value: rel, options: arrays, onChange: (v?: string) => (relation.value = v ?? '') })
              : h('input', { class: 'ar-input', 'aria-label': 'Detail relation', placeholder: 'array field', value: relation.value, onInput: (e: Event) => (relation.value = (e.target as HTMLInputElement).value) }),
            h('button', { type: 'submit', class: 'ar-btn', disabled: !rel }, l.addChildRegion),
          ],
        ),
        h('button', { type: 'button', class: 'ar-btn ar-btn-danger', onClick: () => controller.removeRegion(r.id) }, l.removeRegion),
      ]);
    };
  },
});

function groupProperties(ctx: DesignerContext, group: Group): VNode {
  const { controller, labels } = ctx;
  const l = labels.value;
  return section(`Group (${group.id})`, [
    h(ExpressionField, { label: 'Group by', value: group.expression, onCommit: (expression?: string) => expression && controller.updateGroup(group.id, { expression }) }),
    field('Order', (id) =>
      h(SelectInput, { id, value: group.sortDirection ?? 'asc', options: ['asc', 'desc', 'none'], onChange: (d?: string) => controller.updateGroup(group.id, { sortDirection: d as GroupSortDirection | undefined }) }),
    ),
    check('Group header', !!group.header, (on) => controller.setGroupBand(group.id, 'header', on)),
    check('Group footer', !!group.footer, (on) => controller.setGroupBand(group.id, 'footer', on)),
    check('New page for each group', !!group.pageBreakBefore, (on) => controller.updateGroup(group.id, { pageBreakBefore: on || undefined })),
    h('div', { class: 'ar-field-row' }, [
      h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.moveGroup(group.id, -1) }, 'Move out'),
      h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.moveGroup(group.id, 1) }, 'Move in'),
      h('button', { type: 'button', class: 'ar-btn ar-btn-danger', onClick: () => controller.removeGroup(group.id) }, l.removeGroup),
    ]),
  ]);
}

function bandProperties(ctx: DesignerContext, band: Band, role: string): VNode {
  const { controller, state, labels } = ctx;
  const l = labels.value;
  const unit = state.value.template.unit;
  const update = (patch: Partial<Band>) => controller.updateBand(band.id, patch);
  const isPageBand = role === 'pageHeader' || role === 'pageFooter';
  return section(`${l.band} (${band.id})`, [
    field(`Height (${unit})`, (id) => h(NumberInput, { id, min: 0, value: band.height, onCommit: (v?: number) => controller.resizeBand(band.id, v ?? 0) })),
    ...(isPageBand
      ? [
          check('Print on first page', band.printOnFirstPage !== false, (on) => update({ printOnFirstPage: on ? undefined : false })),
          check('Print on last page', band.printOnLastPage !== false, (on) => update({ printOnLastPage: on ? undefined : false })),
        ]
      : [
          check('Grow to fit content', band.canGrow !== false, (on) => update({ canGrow: on ? undefined : false })),
          check('Shrink to content', !!band.canShrink, (on) => update({ canShrink: on || undefined })),
          check('Page break before', !!band.pageBreakBefore, (on) => update({ pageBreakBefore: on || undefined })),
          check('Page break after', !!band.pageBreakAfter, (on) => update({ pageBreakAfter: on || undefined })),
        ]),
    h(ExpressionField, { label: 'Visible if', value: band.visible, bandId: band.id, placeholder: 'always', onCommit: (visible?: string) => update({ visible }) }),
    ...styleEditor(band.style ?? {}, (patch) => update({ style: patchStyle(band.style, patch) }), false, l.align),
  ]);
}

function reportProperties(ctx: DesignerContext): VNode[] {
  const { controller, state, labels } = ctx;
  const l = labels.value;
  const t = state.value.template;
  const page = t.page;
  const custom = typeof page.size !== 'string';
  return [
    section(l.report, [
      field('Name', (id) => h(TextInput, { id, value: t.name, onCommit: (name: string) => name.trim() && controller.updateTemplate({ name }) })),
      field('Description', (id) => h(TextInput, { id, value: t.description ?? '', onCommit: (d: string) => controller.updateTemplate({ description: d || undefined }) })),
      field('Locale', (id) => h(TextInput, { id, value: t.locale ?? '', placeholder: 'en-US', onCommit: (locale: string) => controller.updateTemplate({ locale: locale || undefined }) })),
      field('Unit', (id) => h(SelectInput, { id, value: t.unit, options: UNITS, onChange: (unit?: string) => unit && controller.updateTemplate({ unit: unit as Unit }) })),
    ]),
    section('Page', [
      field('Size', (id) =>
        h(SelectInput, {
          id,
          value: custom ? 'custom' : (page.size as string),
          options: [...PAPER_SIZE_NAMES, 'custom'],
          onChange: (size?: string) => {
            if (!size) return;
            if (size === 'custom') controller.updateTemplate({ page: { ...page, size: { width: controller.bodyWidth() + page.margins.left + page.margins.right, height: 100 } } });
            else controller.updateTemplate({ page: { ...page, size: size as (typeof PAPER_SIZE_NAMES)[number] } });
          },
        }),
      ),
      custom && typeof page.size !== 'string'
        ? h('div', { class: 'ar-field-row' }, [
            h(NumberInput, {
              ariaLabel: `Page width (${t.unit})`,
              min: 1,
              value: page.size.width,
              onCommit: (width?: number) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), width: width ?? 1 } } }),
            }),
            h(NumberInput, {
              ariaLabel: `Page height (${t.unit})`,
              min: 1,
              value: page.size.height,
              onCommit: (height?: number) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), height: height ?? 1 } } }),
            }),
          ])
        : null,
      field('Orientation', (id) =>
        h(SelectInput, { id, value: page.orientation, options: ORIENTATIONS, onChange: (o?: string) => o && controller.updateTemplate({ page: { ...page, orientation: o as 'portrait' | 'landscape' } }) }),
      ),
      h(
        'div',
        { class: 'ar-field-grid', role: 'group', 'aria-label': `Margins (${t.unit})` },
        (['top', 'right', 'bottom', 'left'] as const).map((side) =>
          h('label', { key: side, class: 'ar-hint' }, [
            side,
            h(NumberInput, {
              ariaLabel: `Margin ${side} (${t.unit})`,
              min: 0,
              value: page.margins[side],
              onCommit: (v?: number) => controller.updateTemplate({ page: { ...page, margins: { ...page.margins, [side]: v ?? 0 } } }),
            }),
          ]),
        ),
      ),
    ]),
    section('Bands', [
      ...(['reportHeader', 'pageHeader', 'pageFooter', 'reportFooter'] as const).map((slot) => check(PAGE_BAND_LABELS[slot], !!t[slot], (on) => controller.setPageBand(slot, on))),
      h('div', { class: 'ar-field-row' }, [
        h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.addStaticBand() }, l.addBand),
        t.dataSources.length ? h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.addDataRegion(t.dataSources[0]!.name) }, l.addDataRegion) : null,
      ]),
    ]),
  ];
}

/** Properties of the current selection: component(s), band (with its region/group) or the report. */
export const PropertiesPanel = defineComponent({
  name: 'ArPropertiesPanel',
  setup() {
    const ctx = useDesignerContext();
    return () => {
      const { controller, state, labels } = ctx;
      const { selection, template, errors } = state.value;
      const components = controller.selectedComponents();
      let body: VNode | VNode[] | null = null;
      if (components.length === 1 && selection.bandId) {
        body = h(ComponentProperties, { key: components[0]!.id, component: components[0]!, bandId: selection.bandId });
      } else if (components.length > 1) {
        body = section(`${components.length} components`, styleEditor({}, (patch) => controller.updateComponentStyle(patch), components.every((c) => c.type === 'text'), labels.value.align));
      } else if (selection.bandId) {
        const visit = findBand(template, selection.bandId);
        if (visit) {
          const group = visit.region?.groups?.find((g) => g.header?.id === visit.band.id || g.footer?.id === visit.band.id);
          body = [
            bandProperties(ctx, visit.band, visit.role),
            group ? groupProperties(ctx, group) : (null as unknown as VNode),
            visit.region ? h(RegionProperties, { key: visit.region.id, region: visit.region }) : (null as unknown as VNode),
          ];
        }
      }
      return h('aside', { class: 'ar-panel ar-panel-right', 'aria-label': labels.value.properties }, [
        ...(body === null ? reportProperties(ctx) : Array.isArray(body) ? body : [body]),
        errors.length
          ? section(`Template errors (${errors.length})`, [
              h(
                'ul',
                { style: { margin: 0, paddingLeft: '16px' } },
                errors.slice(0, 20).map((e, i) => h('li', { key: i, class: 'ar-field-error' }, [h('code', e.path), `: ${e.message}`])),
              ),
            ])
          : null,
      ]);
    };
  },
});
