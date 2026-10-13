import { useId, useState } from 'react';
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
  VERTICAL_ALIGNS,
  type Band,
  type BorderSpec,
  type DataRegion,
  type Group,
  type ReportComponent,
  type StyleProps,
  type ValueFormat,
} from '@ariana-reports/core';
import { useDesignerContext } from './context';
import { CheckInput, ColorInput, Field, NumberInput, Section, SelectInput, TextInput, validateExpression, validateText } from './inputs';
import { Icon } from '../Icon';



function Completions({ id, bandId }: { id: string; bandId?: string }) {
  const { controller } = useDesignerContext();
  return (
    <datalist id={id}>
      {controller.completions(bandId).map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

/** Expression input with syntax checking and autocompletion. */
function ExpressionField({ label, value, onCommit, bandId, placeholder }: { label: string; value: string | undefined; onCommit: (v: string | undefined) => void; bandId?: string; placeholder?: string }) {
  const listId = useId();
  return (
    <Field label={label}>
      {(id) => (
        <>
          <TextInput id={id} value={value ?? ''} list={listId} placeholder={placeholder} validate={validateExpression} onCommit={(v) => onCommit(v.trim() === '' ? undefined : v)} />
          <Completions id={listId} bandId={bandId} />
        </>
      )}
    </Field>
  );
}

function StyleEditor({ style, onChange, textProps = true }: { style: StyleProps; onChange: (patch: Partial<Record<keyof StyleProps, unknown>>) => void; textProps?: boolean }) {
  const { labels, values, fonts } = useDesignerContext();
  const border = style.border;
  const setBorder = (patch: Partial<BorderSpec> | null) => {
    if (patch === null) return onChange({ border: undefined });
    onChange({ border: { width: 0.5, color: '#000000', style: 'solid', ...border, ...patch } });
  };
  const padding = typeof style.padding === 'number' ? style.padding : undefined;
  return (
    <>
      {textProps && (
        <>
          <Field label={labels.font}>
            {(id) => (
              <SelectInput
                id={id}
                value={style.fontFamily}
                options={[...new Set([...fonts, ...(style.fontFamily ? [style.fontFamily] : [])])]}
                allowEmpty={labels.defaultOption}
                onChange={(fontFamily) => onChange({ fontFamily })}
              />
            )}
          </Field>
          <Field label={labels.fontSize}>{(id) => <NumberInput id={id} optional min={1} value={style.fontSize} onCommit={(fontSize) => onChange({ fontSize })} />}</Field>
          <Field label={labels.fontWeight}>{(id) => <SelectInput id={id} value={style.fontWeight} options={FONT_WEIGHTS} translate allowEmpty={labels.defaultOption} onChange={(fontWeight) => onChange({ fontWeight })} />}</Field>
          <Field label={labels.fontStyle}>{(id) => <SelectInput id={id} value={style.fontStyle} options={FONT_STYLES} translate allowEmpty={labels.defaultOption} onChange={(fontStyle) => onChange({ fontStyle })} />}</Field>
          <Field label={labels.textDecoration}>
            {(id) => <SelectInput id={id} value={style.textDecoration} options={TEXT_DECORATIONS} translate allowEmpty={labels.defaultOption} onChange={(textDecoration) => onChange({ textDecoration })} />}
          </Field>
          <Field label={labels.color}>{(id) => <ColorInput id={id} ariaLabel={labels.textColor} value={style.color} onChange={(color) => onChange({ color })} />}</Field>
          <Field label={labels.align}>
            {(id) => <SelectInput id={id} value={style.textAlign} options={TEXT_ALIGNS} translate allowEmpty={labels.defaultOption} onChange={(textAlign) => onChange({ textAlign })} />}
          </Field>
          <Field label={labels.verticalAlign}>
            {(id) => <SelectInput id={id} value={style.verticalAlign} options={VERTICAL_ALIGNS} translate allowEmpty={labels.defaultOption} onChange={(verticalAlign) => onChange({ verticalAlign })} />}
          </Field>
          <Field label={labels.padding}>{(id) => <NumberInput id={id} optional min={0} value={padding} onCommit={(p) => onChange({ padding: p })} />}</Field>
        </>
      )}
      <Field label={labels.background}>{(id) => <ColorInput id={id} ariaLabel={labels.backgroundColor} value={style.backgroundColor} onChange={(backgroundColor) => onChange({ backgroundColor })} />}</Field>
      <CheckInput label={labels.border} checked={!!border} onChange={(on) => setBorder(on ? {} : null)} />
      {border && (
        <>
          <Field label={labels.borderWidth}>{(id) => <NumberInput id={id} min={0} value={border.width} onCommit={(width) => setBorder({ width: width ?? 0 })} />}</Field>
          <Field label={labels.borderColor}>{(id) => <ColorInput id={id} ariaLabel={labels.borderColor} value={border.color} onChange={(color) => setBorder({ color: color ?? '#000000' })} />}</Field>
          <Field label={labels.borderStyle}>{(id) => <SelectInput id={id} value={border.style} options={BORDER_LINE_STYLES} translate onChange={(s) => s && setBorder({ style: s })} />}</Field>
          <div className="ar-field-row" role="group" aria-label={labels.borderSides}>
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
              const sides = border.sides ?? ['top', 'right', 'bottom', 'left'];
              return (
                <CheckInput
                  key={side}
                  label={values[side] ?? side}
                  checked={sides.includes(side)}
                  onChange={(on) => {
                    const next = on ? [...sides, side] : sides.filter((s) => s !== side);
                    setBorder({ sides: next.length === 4 ? undefined : next });
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function FormatEditor({ format, onChange }: { format: ValueFormat | undefined; onChange: (f: ValueFormat | undefined) => void }) {
  const { labels } = useDesignerContext();
  const type = format?.type;
  return (
    <>
      <Field label={labels.format}>
        {(id) => (
          <SelectInput
            id={id}
            value={type}
            options={['number', 'currency', 'percent', 'date'] as const}
            translate
            allowEmpty={labels.noneOption}
            onChange={(t) => {
              if (!t) return onChange(undefined);
              if (t === 'number') onChange({ type: 'number', decimals: 2, thousandsSeparator: true });
              if (t === 'currency') onChange({ type: 'currency', currency: 'USD' });
              if (t === 'percent') onChange({ type: 'percent', decimals: 0 });
              if (t === 'date') onChange({ type: 'date', pattern: 'yyyy-MM-dd' });
            }}
          />
        )}
      </Field>
      {format && format.type !== 'date' && (
        <Field label={labels.decimals}>
          {(id) => <NumberInput id={id} optional min={0} step={1} value={format.decimals} onCommit={(decimals) => onChange({ ...format, decimals } as ValueFormat)} />}
        </Field>
      )}
      {format?.type === 'currency' && (
        <Field label={labels.currency}>
          {(id) => <TextInput id={id} value={format.currency} validate={(v) => (/^[A-Z]{3}$/.test(v) ? null : labels.currencyHint)} onCommit={(currency) => onChange({ ...format, currency })} />}
        </Field>
      )}
      {format?.type === 'number' && (
        <CheckInput label={labels.thousandsSeparator} checked={format.thousandsSeparator !== false} onChange={(thousandsSeparator) => onChange({ ...format, thousandsSeparator })} />
      )}
      {format?.type === 'date' && (
        <>
          <Field label={labels.pattern}>{(id) => <TextInput id={id} value={format.pattern} onCommit={(pattern) => pattern && onChange({ ...format, pattern })} />}</Field>
          <Field label={labels.calendar}>
            {(id) => (
              <SelectInput
                id={id}
                value={format.calendar ?? 'gregory'}
                options={CALENDARS}
                translate
                onChange={(calendar) => onChange({ ...format, calendar: calendar === 'gregory' ? undefined : calendar })}
              />
            )}
          </Field>
        </>
      )}
    </>
  );
}

function ComponentProperties({ component, bandId }: { component: ReportComponent; bandId: string }) {
  const { controller, state, labels, values, openTextEditor } = useDesignerContext();
  const update = (patch: Partial<ReportComponent>) => controller.updateComponent(component.id, patch);
  const unit = state.template.unit;
  const styles = Object.keys(state.template.styles ?? {});
  const [styleName, setStyleName] = useState('');
  const textListId = useId();
  return (
    <>
      <Section title={`${labels[component.type]} (${component.id})`}>
        <Field label={labels.name}>{(id) => <TextInput id={id} value={component.name ?? ''} onCommit={(name) => update({ name: name || undefined })} />}</Field>
        <div className="ar-field-grid" role="group" aria-label={`${labels.positionAndSize} (${unit})`}>
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <label key={k} className="ar-hint">
              {values[k] ?? k} ({unit})
              <NumberInput min={0} value={component[k]} onCommit={(v) => update({ [k]: v ?? 0 })} ariaLabel={`${values[k] ?? k} (${unit})`} />
            </label>
          ))}
        </div>
        <CheckInput label={labels.growToHeight} checked={!!component.growToHeight} onChange={(on) => update({ growToHeight: on || undefined })} />
      </Section>
      {component.type === 'text' && (
        <Section title={labels.content}>
          <Field label={labels.textField} full>
            {(id) => (
              <>
                <div className="ar-field-control">
                  <TextInput id={id} multiline value={component.text} validate={validateText} onCommit={(text) => update({ text } as Partial<ReportComponent>)} />
                  <button type="button" className="ar-btn ar-btn-icon ar-btn-sm ar-btn-outline" aria-label={labels.openTextEditor} title={labels.openTextEditor} onClick={() => openTextEditor(component.id)}>
                    <Icon name="expand" />
                  </button>
                </div>
                <Completions id={textListId} bandId={bandId} />
              </>
            )}
          </Field>
          <p className="ar-hint">{labels.textHint}</p>
          <FormatEditor format={component.format} onChange={(format) => update({ format } as Partial<ReportComponent>)} />
          <CheckInput label={labels.canGrowText} checked={!!component.canGrow} onChange={(canGrow) => update({ canGrow: canGrow || undefined } as Partial<ReportComponent>)} />
          <CheckInput label={labels.wordWrap} checked={component.wordWrap !== false} onChange={(w) => update({ wordWrap: w ? undefined : false } as Partial<ReportComponent>)} />
          <CheckInput label={labels.allowHtml} checked={!!component.allowHtml} onChange={(on) => update({ allowHtml: on || undefined } as Partial<ReportComponent>)} />
          {component.allowHtml && <p className="ar-hint">{labels.allowHtmlHint}</p>}
        </Section>
      )}
      {component.type === 'image' && (
        <Section title={labels.image}>
          <Field label={labels.source}>{(id) => <TextInput id={id} value={component.src} validate={validateText} placeholder={labels.imageSourcePlaceholder} onCommit={(src) => update({ src } as Partial<ReportComponent>)} />}</Field>
          <Field label={labels.fit}>{(id) => <SelectInput id={id} value={component.fit ?? 'contain'} options={IMAGE_FITS} translate onChange={(fit) => update({ fit } as Partial<ReportComponent>)} />}</Field>
        </Section>
      )}
      {component.type === 'line' && (
        <Section title={labels.line}>
          <Field label={labels.orientation}>
            {(id) => (
              <SelectInput
                id={id}
                value={component.orientation}
                options={LINE_ORIENTATIONS}
                translate
                onChange={(orientation) => {
                  if (!orientation || orientation === component.orientation) return;
                  const length = component.orientation === 'horizontal' ? component.width : component.height;
                  update({ orientation, width: orientation === 'horizontal' ? length : 0, height: orientation === 'vertical' ? length : 0 } as Partial<ReportComponent>);
                }}
              />
            )}
          </Field>
          <p className="ar-hint">{labels.lineHint}</p>
        </Section>
      )}
      {component.type === 'rectangle' && (
        <Section title={labels.rectangle}>
          <Field label={`${labels.radius} (${unit})`}>{(id) => <NumberInput id={id} optional min={0} value={component.cornerRadius} onCommit={(cornerRadius) => update({ cornerRadius } as Partial<ReportComponent>)} />}</Field>
        </Section>
      )}
      <Section title={labels.styleSection}>
        <Field label={labels.namedStyle}>
          {(id) => <SelectInput id={id} value={component.styleName} options={styles} allowEmpty={labels.noneOption} onChange={(name) => update({ styleName: name })} />}
        </Field>
        <StyleEditor style={component.style ?? {}} textProps={component.type === 'text'} onChange={(patch) => controller.updateComponentStyle(patch, [component.id])} />
        <form
          className="ar-field-row"
          onSubmit={(e) => {
            e.preventDefault();
            const name = styleName.trim();
            if (!name || !component.style) return;
            controller.setStyle(name, component.style);
            controller.updateComponent(component.id, { styleName: name, style: undefined });
            setStyleName('');
          }}
        >
          <input className="ar-input" aria-label={labels.newStyleName} placeholder={labels.styleNamePlaceholder} value={styleName} onChange={(e) => setStyleName(e.target.value)} />
          <button type="submit" className="ar-btn" disabled={!component.style}>
            {labels.saveAsStyle}
          </button>
        </form>
      </Section>
      <Section title={labels.behavior}>
        <ExpressionField label={labels.visibleIf} value={component.visible} bandId={bandId} placeholder={labels.always} onCommit={(visible) => update({ visible })} />
        <h4 className="ar-panel-title">{labels.conditionalStyles}</h4>
        {(component.conditions ?? []).map((cond, i) => (
          <div key={i} className="ar-subsection">
            <ExpressionField
              label={labels.when}
              value={cond.expression}
              bandId={bandId}
              onCommit={(expression) => {
                const conditions = [...(component.conditions ?? [])];
                conditions[i] = { ...cond, expression: expression ?? 'true' };
                update({ conditions });
              }}
            />
            <StyleEditor
              style={cond.style}
              textProps={component.type === 'text'}
              onChange={(patch) => {
                const style: Record<string, unknown> = { ...cond.style };
                for (const [k, v] of Object.entries(patch)) v === undefined ? delete style[k] : (style[k] = v);
                const conditions = [...(component.conditions ?? [])];
                conditions[i] = { ...cond, style: style as StyleProps };
                update({ conditions });
              }}
            />
            <button
              type="button"
              className="ar-btn ar-btn-danger"
              onClick={() => {
                const conditions = (component.conditions ?? []).filter((_, j) => j !== i);
                update({ conditions: conditions.length ? conditions : undefined });
              }}
            >
              {labels.removeCondition}
            </button>
          </div>
        ))}
        <button type="button" className="ar-btn ar-btn-outline ar-btn-sm" onClick={() => update({ conditions: [...(component.conditions ?? []), { expression: 'true', style: { color: '#b91c1c' } }] })}>
          <Icon name="plus" />
          {labels.addCondition}
        </button>
      </Section>
    </>
  );
}

function SortEditor({ region }: { region: DataRegion }) {
  const { controller, labels } = useDesignerContext();
  const rules = region.sort ?? [];
  const set = (sort: DataRegion['sort']) => controller.updateRegion(region.id, { sort: sort && sort.length ? sort : undefined });
  return (
    <>
      <h4 className="ar-panel-title">{labels.sort}</h4>
      {rules.map((rule, i) => (
        <div key={i} className="ar-field-row">
          <TextInput ariaLabel={formatLabel(labels.sortExpression, { n: i + 1 })} value={rule.expression} validate={validateExpression} onCommit={(expression) => set(rules.map((r, j) => (j === i ? { ...r, expression } : r)))} />
          <SelectInput ariaLabel={formatLabel(labels.sortDirection, { n: i + 1 })} value={rule.direction} options={SORT_DIRECTIONS} translate onChange={(direction) => direction && set(rules.map((r, j) => (j === i ? { ...r, direction } : r)))} />
          <button type="button" className="ar-btn ar-btn-icon ar-btn-sm ar-btn-danger" aria-label={formatLabel(labels.removeSort, { n: i + 1 })} title={formatLabel(labels.removeSort, { n: i + 1 })} onClick={() => set(rules.filter((_, j) => j !== i))}>
            <Icon name="close" />
          </button>
        </div>
      ))}
      <button type="button" className="ar-btn ar-btn-outline ar-btn-sm" onClick={() => set([...rules, { expression: 'row.id', direction: 'asc' }])}>
        <Icon name="plus" />
        {labels.addSort}
      </button>
    </>
  );
}

function RegionProperties({ region }: { region: DataRegion }) {
  const { controller, state, labels } = useDesignerContext();
  const isChild = !!findRegion(state.template, region.id)?.parent;
  const [newGroup, setNewGroup] = useState('row.');
  return (
    <Section title={`${labels.dataBand} (${region.id})`}>
      {!isChild || region.dataSource !== undefined ? (
        <Field label={labels.dataSource}>
          {(id) => (
            <SelectInput id={id} value={region.dataSource} options={state.template.dataSources.map((d) => d.name)} onChange={(dataSource) => dataSource && controller.updateRegion(region.id, { dataSource })} />
          )}
        </Field>
      ) : (
        <Field label={labels.relation}>{(id) => <TextInput id={id} value={region.relation ?? ''} onCommit={(relation) => relation && controller.updateRegion(region.id, { relation })} />}</Field>
      )}
      <ExpressionField label={labels.filter} value={region.filter} bandId={region.detail.id} placeholder={labels.allRows} onCommit={(filter) => controller.updateRegion(region.id, { filter })} />
      <SortEditor region={region} />
      <CheckInput label={labels.showHeader} checked={!!region.header} onChange={(on) => controller.setRegionBand(region.id, 'header', on)} />
      <CheckInput label={labels.showFooter} checked={!!region.footer} onChange={(on) => controller.setRegionBand(region.id, 'footer', on)} />
      <CheckInput label={labels.repeatHeader} checked={!!region.repeatHeaderOnEachPage} onChange={(on) => controller.updateRegion(region.id, { repeatHeaderOnEachPage: on || undefined })} />
      <form
        className="ar-field-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (validateExpression(newGroup)) return;
          controller.addGroup(region.id, newGroup);
          setNewGroup('row.');
        }}
      >
        <input className="ar-input" aria-label={labels.groupExpression} value={newGroup} aria-invalid={validateExpression(newGroup) ? true : undefined} onChange={(e) => setNewGroup(e.target.value)} />
        <button type="submit" className="ar-btn">
          {labels.addGroup}
        </button>
      </form>
      <ChildRegionForm region={region} />
      <button type="button" className="ar-btn ar-btn-danger" onClick={() => controller.removeRegion(region.id)}>
        {labels.removeRegion}
      </button>
    </Section>
  );
}

function ChildRegionForm({ region }: { region: DataRegion }) {
  const { controller, labels } = useDesignerContext();
  const arrays = (controller.regionFields(region) ?? []).filter((f) => f.type === 'array').map((f) => f.name);
  const [relation, setRelation] = useState('');
  const value = relation || arrays[0] || '';
  return (
    <form
      className="ar-field-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) controller.addChildRegion(region.id, { relation: value });
      }}
    >
      {arrays.length > 0 ? (
        <SelectInput ariaLabel={labels.detailRelation} value={value} options={arrays} onChange={(v) => setRelation(v ?? '')} />
      ) : (
        <input className="ar-input" aria-label={labels.detailRelation} placeholder={labels.arrayField} value={relation} onChange={(e) => setRelation(e.target.value)} />
      )}
      <button type="submit" className="ar-btn" disabled={!value}>
        {labels.addChildRegion}
      </button>
    </form>
  );
}

function GroupProperties({ group }: { group: Group }) {
  const { controller, labels } = useDesignerContext();
  return (
    <Section title={`${labels.group} (${group.id})`}>
      <ExpressionField label={labels.groupBy} value={group.expression} onCommit={(expression) => expression && controller.updateGroup(group.id, { expression })} />
      <Field label={labels.order}>{(id) => <SelectInput id={id} value={group.sortDirection ?? 'asc'} options={['asc', 'desc', 'none'] as const} translate onChange={(sortDirection) => controller.updateGroup(group.id, { sortDirection })} />}</Field>
      <CheckInput label={labels.groupHeader} checked={!!group.header} onChange={(on) => controller.setGroupBand(group.id, 'header', on)} />
      <CheckInput label={labels.groupFooter} checked={!!group.footer} onChange={(on) => controller.setGroupBand(group.id, 'footer', on)} />
      <CheckInput label={labels.newPagePerGroup} checked={!!group.pageBreakBefore} onChange={(on) => controller.updateGroup(group.id, { pageBreakBefore: on || undefined })} />
      <div className="ar-field-row">
        <button type="button" className="ar-btn" onClick={() => controller.moveGroup(group.id, -1)}>
          {labels.moveOut}
        </button>
        <button type="button" className="ar-btn" onClick={() => controller.moveGroup(group.id, 1)}>
          {labels.moveIn}
        </button>
        <button type="button" className="ar-btn ar-btn-danger" onClick={() => controller.removeGroup(group.id)}>
          {labels.removeGroup}
        </button>
      </div>
    </Section>
  );
}

function BandProperties({ band, role }: { band: Band; role: string }) {
  const { controller, state, labels } = useDesignerContext();
  const unit = state.template.unit;
  const update = (patch: Partial<Band>) => controller.updateBand(band.id, patch);
  const isPageBand = role === 'pageHeader' || role === 'pageFooter';
  return (
    <Section title={`${labels.band} (${band.id})`}>
      <Field label={`${labels.height} (${unit})`}>{(id) => <NumberInput id={id} min={0} value={band.height} onCommit={(h) => controller.resizeBand(band.id, h ?? 0)} />}</Field>
      {!isPageBand && (
        <>
          <CheckInput label={labels.bandCanGrow} checked={band.canGrow !== false} onChange={(on) => update({ canGrow: on ? undefined : false })} />
          <CheckInput label={labels.bandCanShrink} checked={!!band.canShrink} onChange={(on) => update({ canShrink: on || undefined })} />
          <CheckInput label={labels.pageBreakBefore} checked={!!band.pageBreakBefore} onChange={(on) => update({ pageBreakBefore: on || undefined })} />
          <CheckInput label={labels.pageBreakAfter} checked={!!band.pageBreakAfter} onChange={(on) => update({ pageBreakAfter: on || undefined })} />
        </>
      )}
      {isPageBand && (
        <>
          <CheckInput label={labels.printOnFirstPage} checked={band.printOnFirstPage !== false} onChange={(on) => update({ printOnFirstPage: on ? undefined : false })} />
          <CheckInput label={labels.printOnLastPage} checked={band.printOnLastPage !== false} onChange={(on) => update({ printOnLastPage: on ? undefined : false })} />
        </>
      )}
      <ExpressionField label={labels.visibleIf} value={band.visible} bandId={band.id} placeholder={labels.always} onCommit={(visible) => update({ visible })} />
      <Field label={labels.bandColor}>
        {(id) => <ColorInput id={id} ariaLabel={labels.bandColor} value={band.designColor} onChange={(designColor) => update({ designColor })} />}
      </Field>
      <p className="ar-hint">{labels.bandColorHint}</p>
      <StyleEditor
        style={band.style ?? {}}
        textProps={false}
        onChange={(patch) => {
          const style: Record<string, unknown> = { ...band.style };
          for (const [k, v] of Object.entries(patch)) v === undefined ? delete style[k] : (style[k] = v);
          update({ style: Object.keys(style).length ? (style as StyleProps) : undefined });
        }}
      />
    </Section>
  );
}

function ReportProperties() {
  const { controller, state, labels, values } = useDesignerContext();
  const t = state.template;
  const page = t.page;
  const custom = typeof page.size !== 'string';
  return (
    <>
      <Section title={labels.report}>
        <Field label={labels.name}>{(id) => <TextInput id={id} value={t.name} onCommit={(name) => name.trim() && controller.updateTemplate({ name })} />}</Field>
        <Field label={labels.description}>{(id) => <TextInput id={id} value={t.description ?? ''} onCommit={(d) => controller.updateTemplate({ description: d || undefined })} />}</Field>
        <Field label={labels.locale}>{(id) => <TextInput id={id} value={t.locale ?? ''} placeholder="en-US" onCommit={(locale) => controller.updateTemplate({ locale: locale || undefined })} />}</Field>
        <Field label={labels.unit}>{(id) => <SelectInput id={id} value={t.unit} options={UNITS} translate onChange={(unit) => unit && controller.updateTemplate({ unit })} />}</Field>
      </Section>
      <Section title={labels.page}>
        <Field label={labels.pageSize}>
          {(id) => (
            <SelectInput
              id={id}
              value={custom ? 'custom' : (page.size as string)}
              options={[...PAPER_SIZE_NAMES, 'custom']}
              translate
              onChange={(size) => {
                if (!size) return;
                if (size === 'custom') controller.updateTemplate({ page: { ...page, size: { width: controller.bodyWidth() + page.margins.left + page.margins.right, height: 100 } } });
                else controller.updateTemplate({ page: { ...page, size: size as (typeof PAPER_SIZE_NAMES)[number] } });
              }}
            />
          )}
        </Field>
        {custom && typeof page.size !== 'string' && (
          <div className="ar-field-row">
            <NumberInput ariaLabel={`${labels.pageWidth} (${t.unit})`} min={1} value={page.size.width} onCommit={(width) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), width: width ?? 1 } } })} />
            <NumberInput ariaLabel={`${labels.pageHeight} (${t.unit})`} min={1} value={page.size.height} onCommit={(height) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), height: height ?? 1 } } })} />
          </div>
        )}
        <Field label={labels.orientation}>{(id) => <SelectInput id={id} value={page.orientation} options={ORIENTATIONS} translate onChange={(orientation) => orientation && controller.updateTemplate({ page: { ...page, orientation } })} />}</Field>
        <div className="ar-field-grid" role="group" aria-label={`${labels.margins} (${t.unit})`}>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side} className="ar-hint">
              {values[side] ?? side}
              <NumberInput ariaLabel={`${labels.margin} ${values[side] ?? side} (${t.unit})`} min={0} value={page.margins[side]} onCommit={(v) => controller.updateTemplate({ page: { ...page, margins: { ...page.margins, [side]: v ?? 0 } } })} />
            </label>
          ))}
        </div>
      </Section>
      <Section title={labels.bands}>
        {(['reportHeader', 'pageHeader', 'pageFooter', 'reportFooter'] as const).map((slot) => (
          <CheckInput key={slot} label={labels[slot]} checked={!!t[slot]} onChange={(on) => controller.setPageBand(slot, on)} />
        ))}
        <div className="ar-field-row">
          <button type="button" className="ar-btn" onClick={() => controller.addStaticBand()}>
            {labels.addBand}
          </button>
          {t.dataSources.length > 0 && (
            <button type="button" className="ar-btn" onClick={() => controller.addDataRegion(t.dataSources[0]!.name)}>
              {labels.addDataRegion}
            </button>
          )}
        </div>
      </Section>
    </>
  );
}

/** Properties of the current selection: component(s), band (with its region/group) or the report. */
export function PropertiesPanel() {
  const { controller, state, labels } = useDesignerContext();
  const { selection, template } = state;
  const components = controller.selectedComponents();
  let body: React.ReactNode;
  if (components.length === 1 && selection.bandId) {
    body = <ComponentProperties component={components[0]!} bandId={selection.bandId} />;
  } else if (components.length > 1) {
    body = (
      <Section title={formatLabel(labels.componentsCount, { count: components.length })}>
        <StyleEditor style={{}} textProps={components.every((c) => c.type === 'text')} onChange={(patch) => controller.updateComponentStyle(patch)} />
      </Section>
    );
  } else if (selection.bandId) {
    const visit = findBand(template, selection.bandId);
    if (visit) {
      const group = visit.region?.groups?.find((g) => g.header?.id === visit.band.id || g.footer?.id === visit.band.id);
      body = (
        <>
          <BandProperties band={visit.band} role={visit.role} />
          {group && <GroupProperties group={group} />}
          {visit.region && <RegionProperties region={visit.region} />}
        </>
      );
    }
  }
  const subtitle =
    components.length === 1
      ? `${labels[components[0]!.type]} · ${components[0]!.id}`
      : components.length > 1
        ? formatLabel(labels.componentsCount, { count: components.length })
        : selection.bandId
          ? `${labels.band} · ${selection.bandId}`
          : labels.report;
  return (
    <aside className="ar-panel ar-panel-right" aria-label={labels.properties}>
      <div className="ar-panel-header">
        {labels.properties}
        <span className="ar-hint">{subtitle}</span>
      </div>
      {body ?? <ReportProperties />}
      {state.errors.length > 0 && (
        <Section title={formatLabel(labels.templateErrors, { count: state.errors.length })}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {state.errors.slice(0, 20).map((e, i) => (
              <li key={i} className="ar-field-error">
                <code>{e.path}</code>: {e.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  );
}
