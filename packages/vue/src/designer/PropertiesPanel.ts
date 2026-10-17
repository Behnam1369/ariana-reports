import { defineComponent, h, ref, useId, type PropType, type VNode } from 'vue';
import {
  BORDER_LINE_STYLES,
  CALENDARS,
  findBand,
  findRegion,
  formatLabel,
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
  TEXT_DIRECTIONS,
  VERTICAL_ALIGNS,
  type Band,
  type BorderSpec,
  type Calendar,
  type DataRegion,
  type Group,
  type GroupSortDirection,
  type Labels,
  type ReportComponent,
  type StyleProps,
  type Unit,
  type ValueFormat,
} from '@ariana-reports/core';
import { useDesignerContext, type DesignerContext } from './context';
import { CheckInput, ColorInput, field, NumberInput, panelSection, SelectInput, TextInput, validateExpression, validateText } from './inputs';
import { icon } from '../Icon';

type Patch = Partial<Record<keyof StyleProps, unknown>>;

const section = panelSection;

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

function styleEditor(style: StyleProps, onChange: (patch: Patch) => void, textProps: boolean, l: Labels, values: Record<string, string>, fonts: string[]): VNode[] {
  const border = style.border;
  const setBorder = (patch: Partial<BorderSpec> | null) => {
    if (patch === null) return onChange({ border: undefined });
    onChange({ border: { width: 0.5, color: '#000000', style: 'solid', ...border, ...patch } });
  };
  const out: VNode[] = [];
  if (textProps) {
    out.push(
      field(l.font, (id) =>
        h(SelectInput, {
          id,
          value: style.fontFamily,
          options: [...new Set([...fonts, ...(style.fontFamily ? [style.fontFamily] : [])])],
          allowEmpty: l.defaultOption,
          onChange: (fontFamily?: string) => onChange({ fontFamily }),
        }),
      ),
      field(l.fontSize, (id) => h(NumberInput, { id, optional: true, min: 1, value: style.fontSize, onCommit: (fontSize?: number) => onChange({ fontSize }) })),
      field(l.fontWeight, (id) => h(SelectInput, { id, value: style.fontWeight, options: FONT_WEIGHTS, translate: true, allowEmpty: l.defaultOption, onChange: (fontWeight?: string) => onChange({ fontWeight }) })),
      field(l.fontStyle, (id) => h(SelectInput, { id, value: style.fontStyle, options: FONT_STYLES, translate: true, allowEmpty: l.defaultOption, onChange: (fontStyle?: string) => onChange({ fontStyle }) })),
      field(l.textDecoration, (id) =>
        h(SelectInput, { id, value: style.textDecoration, options: TEXT_DECORATIONS, translate: true, allowEmpty: l.defaultOption, onChange: (textDecoration?: string) => onChange({ textDecoration }) }),
      ),
      field(l.color, (id) => h(ColorInput, { id, ariaLabel: l.textColor, value: style.color, onChange: (color?: string) => onChange({ color }) })),
      field(l.align, (id) => h(SelectInput, { id, value: style.textAlign, options: TEXT_ALIGNS, translate: true, allowEmpty: l.defaultOption, onChange: (textAlign?: string) => onChange({ textAlign }) })),
      field(l.verticalAlign, (id) =>
        h(SelectInput, { id, value: style.verticalAlign, options: VERTICAL_ALIGNS, translate: true, allowEmpty: l.defaultOption, onChange: (verticalAlign?: string) => onChange({ verticalAlign }) }),
      ),
      field(l.textDirection, (id) =>
        h(SelectInput, { id, value: style.direction, options: TEXT_DIRECTIONS, translate: true, allowEmpty: l.defaultOption, onChange: (direction?: string) => onChange({ direction }) }),
      ),
      field(l.padding, (id) =>
        h(NumberInput, { id, optional: true, min: 0, value: typeof style.padding === 'number' ? style.padding : undefined, onCommit: (padding?: number) => onChange({ padding }) }),
      ),
    );
  }
  out.push(
    field(l.background, (id) => h(ColorInput, { id, ariaLabel: l.backgroundColor, value: style.backgroundColor, onChange: (backgroundColor?: string) => onChange({ backgroundColor }) })),
    check(l.border, !!border, (on) => setBorder(on ? {} : null)),
  );
  if (border) {
    const sides = border.sides ?? ['top', 'right', 'bottom', 'left'];
    out.push(
      field(l.borderWidth, (id) => h(NumberInput, { id, min: 0, value: border.width, onCommit: (width?: number) => setBorder({ width: width ?? 0 }) })),
      field(l.borderColor, (id) => h(ColorInput, { id, ariaLabel: l.borderColor, value: border.color, onChange: (color?: string) => setBorder({ color: color ?? '#000000' }) })),
      field(l.borderStyle, (id) => h(SelectInput, { id, value: border.style, options: BORDER_LINE_STYLES, translate: true, onChange: (s?: string) => s && setBorder({ style: s as BorderSpec['style'] }) })),
      h(
        'div',
        { class: 'ar-field-row', role: 'group', 'aria-label': l.borderSides },
        (['top', 'right', 'bottom', 'left'] as const).map((side) =>
          h(CheckInput, {
            key: side,
            label: values[side] ?? side,
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

function formatEditor(format: ValueFormat | undefined, onChange: (f: ValueFormat | undefined) => void, l: Labels): VNode[] {
  const out: VNode[] = [
    field(l.format, (id) =>
      h(SelectInput, {
        id,
        value: format?.type,
        options: ['number', 'currency', 'percent', 'date'],
        translate: true,
        allowEmpty: l.noneOption,
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
    out.push(field(l.decimals, (id) => h(NumberInput, { id, optional: true, min: 0, step: 1, value: format.decimals, onCommit: (decimals?: number) => onChange({ ...format, decimals } as ValueFormat) })));
  }
  if (format?.type === 'currency') {
    out.push(
      field(l.currency, (id) =>
        h(TextInput, { id, value: format.currency, validate: (v: string) => (/^[A-Z]{3}$/.test(v) ? null : l.currencyHint), onCommit: (currency: string) => onChange({ ...format, currency }) }),
      ),
    );
  }
  if (format?.type === 'number') out.push(check(l.thousandsSeparator, format.thousandsSeparator !== false, (thousandsSeparator) => onChange({ ...format, thousandsSeparator })));
  if (format?.type === 'date') {
    out.push(
      field(l.pattern, (id) => h(TextInput, { id, value: format.pattern, onCommit: (pattern: string) => pattern && onChange({ ...format, pattern }) })),
      field(l.calendar, (id) =>
        h(SelectInput, {
          id,
          value: format.calendar ?? 'gregory',
          options: CALENDARS,
          translate: true,
          onChange: (calendar?: string) => onChange({ ...format, calendar: calendar === 'gregory' ? undefined : (calendar as Calendar | undefined) }),
        }),
      ),
    );
  }
  return out;
}

const ComponentProperties = defineComponent({
  name: 'ArComponentProperties',
  props: { component: { type: Object as PropType<ReportComponent>, required: true }, bandId: { type: String, required: true } },
  setup(props) {
    const { controller, state, labels, values, fonts, openTextEditor } = useDesignerContext();
    const styleName = ref('');
    const textList = useId();
    return () => {
      const c = props.component;
      const l = labels.value;
      const v = values.value;
      const unit = state.value.template.unit;
      const update = (patch: Partial<ReportComponent>) => controller.updateComponent(c.id, patch);
      const styles = Object.keys(state.value.template.styles ?? {});
      const parts: VNode[] = [
        section(`${l[c.type]} (${c.id})`, [
          field(l.name, (id) => h(TextInput, { id, value: c.name ?? '', onCommit: (name: string) => update({ name: name || undefined }) })),
          h(
            'div',
            { class: 'ar-field-grid', role: 'group', 'aria-label': `${l.positionAndSize} (${unit})` },
            (['x', 'y', 'width', 'height'] as const).map((k) =>
              h('label', { key: k, class: 'ar-hint' }, [
                `${v[k] ?? k} (${unit})`,
                h(NumberInput, { min: 0, value: c[k], ariaLabel: `${v[k] ?? k} (${unit})`, onCommit: (n?: number) => update({ [k]: n ?? 0 }) }),
              ]),
            ),
          ),
          check(l.growToHeight, !!c.growToHeight, (on) => update({ growToHeight: on || undefined })),
        ]),
      ];
      if (c.type === 'text') {
        parts.push(
          section(l.content, [
            field(
              l.textField,
              (id) => [
                h('div', { class: 'ar-field-control' }, [
                  h(TextInput, { id, multiline: true, value: c.text, validate: validateText, onCommit: (text: string) => update({ text } as Partial<ReportComponent>) }),
                  h(
                    'button',
                    { type: 'button', class: 'ar-btn ar-btn-icon ar-btn-sm ar-btn-outline', 'aria-label': l.openTextEditor, title: l.openTextEditor, onClick: () => openTextEditor(c.id) },
                    [icon('expand')],
                  ),
                ]),
                h('datalist', { id: textList }, controller.completions(props.bandId).map((x) => h('option', { key: x, value: x }))),
              ],
              true,
            ),
            h('p', { class: 'ar-hint' }, l.textHint),
            ...formatEditor(c.format, (format) => update({ format } as Partial<ReportComponent>), l),
            check(l.canGrowText, !!c.canGrow, (canGrow) => update({ canGrow: canGrow || undefined } as Partial<ReportComponent>)),
            check(l.wordWrap, c.wordWrap !== false, (w) => update({ wordWrap: w ? undefined : false } as Partial<ReportComponent>)),
            check(l.allowHtml, !!c.allowHtml, (on) => update({ allowHtml: on || undefined } as Partial<ReportComponent>)),
            c.allowHtml ? h('p', { class: 'ar-hint' }, l.allowHtmlHint) : null,
          ]),
        );
      }
      if (c.type === 'image') {
        parts.push(
          section(l.image, [
            field(l.source, (id) =>
              h(TextInput, { id, value: c.src, validate: validateText, placeholder: l.imageSourcePlaceholder, onCommit: (src: string) => update({ src } as Partial<ReportComponent>) }),
            ),
            field(l.fit, (id) => h(SelectInput, { id, value: c.fit ?? 'contain', options: IMAGE_FITS, translate: true, onChange: (fit?: string) => update({ fit } as Partial<ReportComponent>) })),
          ]),
        );
      }
      if (c.type === 'line') {
        parts.push(
          section(l.line, [
            field(l.orientation, (id) =>
              h(SelectInput, {
                id,
                value: c.orientation,
                options: LINE_ORIENTATIONS,
                translate: true,
                onChange: (o?: string) => {
                  if (!o || o === c.orientation) return;
                  const length = c.orientation === 'horizontal' ? c.width : c.height;
                  update({ orientation: o, width: o === 'horizontal' ? length : 0, height: o === 'vertical' ? length : 0 } as Partial<ReportComponent>);
                },
              }),
            ),
            h('p', { class: 'ar-hint' }, l.lineHint),
          ]),
        );
      }
      if (c.type === 'rectangle') {
        parts.push(
          section(l.rectangle, [
            field(`${l.radius} (${unit})`, (id) => h(NumberInput, { id, optional: true, min: 0, value: c.cornerRadius, onCommit: (cornerRadius?: number) => update({ cornerRadius } as Partial<ReportComponent>) })),
          ]),
        );
      }
      parts.push(
        section(l.styleSection, [
          field(l.namedStyle, (id) => h(SelectInput, { id, value: c.styleName, options: styles, allowEmpty: l.noneOption, onChange: (name?: string) => update({ styleName: name }) })),
          ...styleEditor(c.style ?? {}, (patch) => controller.updateComponentStyle(patch, [c.id]), c.type === 'text', l, v, fonts.value),
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
              h('input', { class: 'ar-input', 'aria-label': l.newStyleName, placeholder: l.styleNamePlaceholder, value: styleName.value, onInput: (e: Event) => (styleName.value = (e.target as HTMLInputElement).value) }),
              h('button', { type: 'submit', class: 'ar-btn', disabled: !c.style }, l.saveAsStyle),
            ],
          ),
        ]),
        section(l.behavior, [
          h(ExpressionField, { label: l.visibleIf, value: c.visible, bandId: props.bandId, placeholder: l.always, onCommit: (visible?: string) => update({ visible }) }),
          h('h4', { class: 'ar-panel-title' }, l.conditionalStyles),
          ...(c.conditions ?? []).map((cond, i) =>
            h('div', { key: i, class: 'ar-subsection' }, [
              h(ExpressionField, {
                label: l.when,
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
                l,
                v,
                fonts.value,
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
                l.removeCondition,
              ),
            ]),
          ),
          h(
            'button',
            { type: 'button', class: 'ar-btn ar-btn-outline ar-btn-sm', onClick: () => update({ conditions: [...(c.conditions ?? []), { expression: 'true', style: { color: '#b91c1c' } }] }) },
            [icon('plus'), l.addCondition],
          ),
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
      return section(`${l.dataBand} (${r.id})`, [
        !isChild || r.dataSource !== undefined
          ? field(l.dataSource, (id) =>
              h(SelectInput, { id, value: r.dataSource, options: state.value.template.dataSources.map((d) => d.name), onChange: (dataSource?: string) => dataSource && controller.updateRegion(r.id, { dataSource }) }),
            )
          : field(l.relation, (id) => h(TextInput, { id, value: r.relation ?? '', onCommit: (v: string) => v && controller.updateRegion(r.id, { relation: v }) })),
        h(ExpressionField, { label: l.filter, value: r.filter, bandId: r.detail.id, placeholder: l.allRows, onCommit: (filter?: string) => controller.updateRegion(r.id, { filter }) }),
        h('h4', { class: 'ar-panel-title' }, l.sort),
        ...rules.map((rule, i) =>
          h('div', { key: i, class: 'ar-field-row' }, [
            h(TextInput, {
              ariaLabel: formatLabel(l.sortExpression, { n: i + 1 }),
              value: rule.expression,
              validate: validateExpression,
              onCommit: (expression: string) => setSort(rules.map((x, j) => (j === i ? { ...x, expression } : x))),
            }),
            h(SelectInput, {
              ariaLabel: formatLabel(l.sortDirection, { n: i + 1 }),
              value: rule.direction,
              options: SORT_DIRECTIONS,
              translate: true,
              onChange: (d?: string) => d && setSort(rules.map((x, j) => (j === i ? { ...x, direction: d as 'asc' | 'desc' } : x))),
            }),
            h(
              'button',
              {
                type: 'button',
                class: 'ar-btn ar-btn-icon ar-btn-sm ar-btn-danger',
                'aria-label': formatLabel(l.removeSort, { n: i + 1 }),
                title: formatLabel(l.removeSort, { n: i + 1 }),
                onClick: () => setSort(rules.filter((_, j) => j !== i)),
              },
              [icon('close')],
            ),
          ]),
        ),
        h('button', { type: 'button', class: 'ar-btn ar-btn-outline ar-btn-sm', onClick: () => setSort([...rules, { expression: 'row.id', direction: 'asc' }]) }, [icon('plus'), l.addSort]),
        check(l.showHeader, !!r.header, (on) => controller.setRegionBand(r.id, 'header', on)),
        check(l.showFooter, !!r.footer, (on) => controller.setRegionBand(r.id, 'footer', on)),
        check(l.repeatHeader, !!r.repeatHeaderOnEachPage, (on) => controller.updateRegion(r.id, { repeatHeaderOnEachPage: on || undefined })),
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
              'aria-label': l.groupExpression,
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
              ? h(SelectInput, { ariaLabel: l.detailRelation, value: rel, options: arrays, onChange: (v?: string) => (relation.value = v ?? '') })
              : h('input', { class: 'ar-input', 'aria-label': l.detailRelation, placeholder: l.arrayField, value: relation.value, onInput: (e: Event) => (relation.value = (e.target as HTMLInputElement).value) }),
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
  return section(`${l.group} (${group.id})`, [
    h(ExpressionField, { label: l.groupBy, value: group.expression, onCommit: (expression?: string) => expression && controller.updateGroup(group.id, { expression }) }),
    field(l.order, (id) =>
      h(SelectInput, { id, value: group.sortDirection ?? 'asc', options: ['asc', 'desc', 'none'], translate: true, onChange: (d?: string) => controller.updateGroup(group.id, { sortDirection: d as GroupSortDirection | undefined }) }),
    ),
    check(l.groupHeader, !!group.header, (on) => controller.setGroupBand(group.id, 'header', on)),
    check(l.groupFooter, !!group.footer, (on) => controller.setGroupBand(group.id, 'footer', on)),
    check(l.newPagePerGroup, !!group.pageBreakBefore, (on) => controller.updateGroup(group.id, { pageBreakBefore: on || undefined })),
    h('div', { class: 'ar-field-row' }, [
      h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.moveGroup(group.id, -1) }, l.moveOut),
      h('button', { type: 'button', class: 'ar-btn', onClick: () => controller.moveGroup(group.id, 1) }, l.moveIn),
      h('button', { type: 'button', class: 'ar-btn ar-btn-danger', onClick: () => controller.removeGroup(group.id) }, l.removeGroup),
    ]),
  ]);
}

function bandProperties(ctx: DesignerContext, band: Band, role: string): VNode {
  const { controller, state, labels, values } = ctx;
  const l = labels.value;
  const unit = state.value.template.unit;
  const update = (patch: Partial<Band>) => controller.updateBand(band.id, patch);
  const isPageBand = role === 'pageHeader' || role === 'pageFooter';
  return section(`${l.band} (${band.id})`, [
    field(`${l.height} (${unit})`, (id) => h(NumberInput, { id, min: 0, value: band.height, onCommit: (v?: number) => controller.resizeBand(band.id, v ?? 0) })),
    ...(isPageBand
      ? [
          check(l.printOnFirstPage, band.printOnFirstPage !== false, (on) => update({ printOnFirstPage: on ? undefined : false })),
          check(l.printOnLastPage, band.printOnLastPage !== false, (on) => update({ printOnLastPage: on ? undefined : false })),
        ]
      : [
          check(l.bandCanGrow, band.canGrow !== false, (on) => update({ canGrow: on ? undefined : false })),
          check(l.bandCanShrink, !!band.canShrink, (on) => update({ canShrink: on || undefined })),
          check(l.pageBreakBefore, !!band.pageBreakBefore, (on) => update({ pageBreakBefore: on || undefined })),
          check(l.pageBreakAfter, !!band.pageBreakAfter, (on) => update({ pageBreakAfter: on || undefined })),
        ]),
    h(ExpressionField, { label: l.visibleIf, value: band.visible, bandId: band.id, placeholder: l.always, onCommit: (visible?: string) => update({ visible }) }),
    field(l.bandColor, (id) => h(ColorInput, { id, ariaLabel: l.bandColor, value: band.designColor, onChange: (designColor?: string) => update({ designColor }) })),
    h('p', { class: 'ar-hint' }, l.bandColorHint),
    ...styleEditor(band.style ?? {}, (patch) => update({ style: patchStyle(band.style, patch) }), false, l, values.value, ctx.fonts.value),
  ]);
}

function reportProperties(ctx: DesignerContext): VNode[] {
  const { controller, state, labels, values } = ctx;
  const l = labels.value;
  const v = values.value;
  const t = state.value.template;
  const page = t.page;
  const custom = typeof page.size !== 'string';
  return [
    section(l.report, [
      field(l.name, (id) => h(TextInput, { id, value: t.name, onCommit: (name: string) => name.trim() && controller.updateTemplate({ name }) })),
      field(l.description, (id) => h(TextInput, { id, value: t.description ?? '', onCommit: (d: string) => controller.updateTemplate({ description: d || undefined }) })),
      field(l.locale, (id) => h(TextInput, { id, value: t.locale ?? '', placeholder: 'en-US', onCommit: (locale: string) => controller.updateTemplate({ locale: locale || undefined }) })),
      field(l.unit, (id) => h(SelectInput, { id, value: t.unit, options: UNITS, translate: true, onChange: (unit?: string) => unit && controller.updateTemplate({ unit: unit as Unit }) })),
    ]),
    section(l.page, [
      field(l.pageSize, (id) =>
        h(SelectInput, {
          id,
          value: custom ? 'custom' : (page.size as string),
          options: [...PAPER_SIZE_NAMES, 'custom'],
          translate: true,
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
              ariaLabel: `${l.pageWidth} (${t.unit})`,
              min: 1,
              value: page.size.width,
              onCommit: (width?: number) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), width: width ?? 1 } } }),
            }),
            h(NumberInput, {
              ariaLabel: `${l.pageHeight} (${t.unit})`,
              min: 1,
              value: page.size.height,
              onCommit: (height?: number) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), height: height ?? 1 } } }),
            }),
          ])
        : null,
      field(l.orientation, (id) =>
        h(SelectInput, { id, value: page.orientation, options: ORIENTATIONS, translate: true, onChange: (o?: string) => o && controller.updateTemplate({ page: { ...page, orientation: o as 'portrait' | 'landscape' } }) }),
      ),
      h(
        'div',
        { class: 'ar-field-grid', role: 'group', 'aria-label': `${l.margins} (${t.unit})` },
        (['top', 'right', 'bottom', 'left'] as const).map((side) =>
          h('label', { key: side, class: 'ar-hint' }, [
            v[side] ?? side,
            h(NumberInput, {
              ariaLabel: `${l.margin} ${v[side] ?? side} (${t.unit})`,
              min: 0,
              value: page.margins[side],
              onCommit: (v?: number) => controller.updateTemplate({ page: { ...page, margins: { ...page.margins, [side]: v ?? 0 } } }),
            }),
          ]),
        ),
      ),
    ]),
    section(l.bands, [
      ...(['reportHeader', 'pageHeader', 'pageFooter', 'reportFooter'] as const).map((slot) => check(l[slot], !!t[slot], (on) => controller.setPageBand(slot, on))),
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
        body = section(
          formatLabel(labels.value.componentsCount, { count: components.length }),
          styleEditor({}, (patch) => controller.updateComponentStyle(patch), components.every((c) => c.type === 'text'), labels.value, ctx.values.value, ctx.fonts.value),
        );
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
      const l = labels.value;
      const subtitle =
        components.length === 1
          ? `${l[components[0]!.type]} · ${components[0]!.id}`
          : components.length > 1
            ? formatLabel(l.componentsCount, { count: components.length })
            : selection.bandId
              ? `${l.band} · ${selection.bandId}`
              : l.report;
      return h('aside', { class: 'ar-panel ar-panel-right', 'aria-label': labels.value.properties }, [
        h('div', { class: 'ar-panel-header' }, [l.properties, h('span', { class: 'ar-hint' }, subtitle)]),
        ...(body === null ? reportProperties(ctx) : Array.isArray(body) ? body : [body]),
        errors.length
          ? section(formatLabel(labels.value.templateErrors, { count: errors.length }), [
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
