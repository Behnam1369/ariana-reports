import { useId, useState } from 'react';
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
  type ReportComponent,
  type StyleProps,
  type ValueFormat,
} from '@ariana-report/core';
import { useDesignerContext } from './context';
import { CheckInput, ColorInput, Field, NumberInput, SelectInput, TextInput, validateExpression, validateText } from './inputs';

const FONT_FAMILIES = ['Helvetica', 'Times', 'Courier'];
const PAGE_BAND_LABELS = { reportHeader: 'Report header', pageHeader: 'Page header', pageFooter: 'Page footer', reportFooter: 'Report footer' } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ar-panel-section">
      <h3 className="ar-panel-title">{title}</h3>
      {children}
    </div>
  );
}

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
  const { labels } = useDesignerContext();
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
          <Field label="Font">
            {(id) => (
              <SelectInput
                id={id}
                value={style.fontFamily}
                options={[...new Set([...FONT_FAMILIES, ...(style.fontFamily ? [style.fontFamily] : [])])]}
                allowEmpty="(default)"
                onChange={(fontFamily) => onChange({ fontFamily })}
              />
            )}
          </Field>
          <Field label="Size (pt)">{(id) => <NumberInput id={id} optional min={1} value={style.fontSize} onCommit={(fontSize) => onChange({ fontSize })} />}</Field>
          <Field label="Weight">{(id) => <SelectInput id={id} value={style.fontWeight} options={FONT_WEIGHTS} allowEmpty="(default)" onChange={(fontWeight) => onChange({ fontWeight })} />}</Field>
          <Field label="Style">{(id) => <SelectInput id={id} value={style.fontStyle} options={FONT_STYLES} allowEmpty="(default)" onChange={(fontStyle) => onChange({ fontStyle })} />}</Field>
          <Field label="Decoration">
            {(id) => <SelectInput id={id} value={style.textDecoration} options={TEXT_DECORATIONS} allowEmpty="(default)" onChange={(textDecoration) => onChange({ textDecoration })} />}
          </Field>
          <Field label="Color">{(id) => <ColorInput id={id} ariaLabel="Text color" value={style.color} onChange={(color) => onChange({ color })} />}</Field>
          <Field label={labels.align}>
            {(id) => <SelectInput id={id} value={style.textAlign} options={TEXT_ALIGNS} allowEmpty="(default)" onChange={(textAlign) => onChange({ textAlign })} />}
          </Field>
          <Field label="Vertical">
            {(id) => <SelectInput id={id} value={style.verticalAlign} options={VERTICAL_ALIGNS} allowEmpty="(default)" onChange={(verticalAlign) => onChange({ verticalAlign })} />}
          </Field>
          <Field label="Padding">{(id) => <NumberInput id={id} optional min={0} value={padding} onCommit={(p) => onChange({ padding: p })} />}</Field>
        </>
      )}
      <Field label="Background">{(id) => <ColorInput id={id} ariaLabel="Background color" value={style.backgroundColor} onChange={(backgroundColor) => onChange({ backgroundColor })} />}</Field>
      <CheckInput label="Border" checked={!!border} onChange={(on) => setBorder(on ? {} : null)} />
      {border && (
        <>
          <Field label="Border width">{(id) => <NumberInput id={id} min={0} value={border.width} onCommit={(width) => setBorder({ width: width ?? 0 })} />}</Field>
          <Field label="Border color">{(id) => <ColorInput id={id} ariaLabel="Border color" value={border.color} onChange={(color) => setBorder({ color: color ?? '#000000' })} />}</Field>
          <Field label="Border style">{(id) => <SelectInput id={id} value={border.style} options={BORDER_LINE_STYLES} onChange={(s) => s && setBorder({ style: s })} />}</Field>
          <div className="ar-field-row" role="group" aria-label="Border sides">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
              const sides = border.sides ?? ['top', 'right', 'bottom', 'left'];
              return (
                <CheckInput
                  key={side}
                  label={side}
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
  const type = format?.type;
  return (
    <>
      <Field label="Format">
        {(id) => (
          <SelectInput
            id={id}
            value={type}
            options={['number', 'currency', 'percent', 'date'] as const}
            allowEmpty="(none)"
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
        <Field label="Decimals">
          {(id) => <NumberInput id={id} optional min={0} step={1} value={format.decimals} onCommit={(decimals) => onChange({ ...format, decimals } as ValueFormat)} />}
        </Field>
      )}
      {format?.type === 'currency' && (
        <Field label="Currency">
          {(id) => <TextInput id={id} value={format.currency} validate={(v) => (/^[A-Z]{3}$/.test(v) ? null : 'Use a 3-letter code such as USD')} onCommit={(currency) => onChange({ ...format, currency })} />}
        </Field>
      )}
      {format?.type === 'number' && (
        <CheckInput label="Thousands separator" checked={format.thousandsSeparator !== false} onChange={(thousandsSeparator) => onChange({ ...format, thousandsSeparator })} />
      )}
      {format?.type === 'date' && (
        <Field label="Pattern">{(id) => <TextInput id={id} value={format.pattern} onCommit={(pattern) => pattern && onChange({ ...format, pattern })} />}</Field>
      )}
    </>
  );
}

function ComponentProperties({ component, bandId }: { component: ReportComponent; bandId: string }) {
  const { controller, state, labels } = useDesignerContext();
  const update = (patch: Partial<ReportComponent>) => controller.updateComponent(component.id, patch);
  const unit = state.template.unit;
  const styles = Object.keys(state.template.styles ?? {});
  const [styleName, setStyleName] = useState('');
  const textListId = useId();
  return (
    <>
      <Section title={`${labels[component.type]} (${component.id})`}>
        <Field label="Name">{(id) => <TextInput id={id} value={component.name ?? ''} onCommit={(name) => update({ name: name || undefined })} />}</Field>
        <div className="ar-field-grid" role="group" aria-label={`Position and size (${unit})`}>
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <label key={k} className="ar-hint">
              {k} ({unit})
              <NumberInput min={0} value={component[k]} onCommit={(v) => update({ [k]: v ?? 0 })} ariaLabel={`${k} (${unit})`} />
            </label>
          ))}
        </div>
      </Section>
      {component.type === 'text' && (
        <Section title="Content">
          <Field label="Text" full>
            {(id) => (
              <>
                <TextInput id={id} multiline value={component.text} validate={validateText} onCommit={(text) => update({ text } as Partial<ReportComponent>)} />
                <Completions id={textListId} bandId={bandId} />
              </>
            )}
          </Field>
          <p className="ar-hint">{'Use {{ expression }} for data, e.g. {{ row.total }} or {{ sum(rows, r => r.total) }}.'}</p>
          <FormatEditor format={component.format} onChange={(format) => update({ format } as Partial<ReportComponent>)} />
          <CheckInput label="Grow to fit text" checked={!!component.canGrow} onChange={(canGrow) => update({ canGrow: canGrow || undefined } as Partial<ReportComponent>)} />
          <CheckInput label="Word wrap" checked={component.wordWrap !== false} onChange={(w) => update({ wordWrap: w ? undefined : false } as Partial<ReportComponent>)} />
        </Section>
      )}
      {component.type === 'image' && (
        <Section title="Image">
          <Field label="Source">{(id) => <TextInput id={id} value={component.src} validate={validateText} placeholder="https://… or data:image/png;base64,…" onCommit={(src) => update({ src } as Partial<ReportComponent>)} />}</Field>
          <Field label="Fit">{(id) => <SelectInput id={id} value={component.fit ?? 'contain'} options={IMAGE_FITS} onChange={(fit) => update({ fit } as Partial<ReportComponent>)} />}</Field>
        </Section>
      )}
      {component.type === 'line' && (
        <Section title="Line">
          <Field label="Orientation">
            {(id) => (
              <SelectInput
                id={id}
                value={component.orientation}
                options={LINE_ORIENTATIONS}
                onChange={(orientation) => {
                  if (!orientation || orientation === component.orientation) return;
                  const length = component.orientation === 'horizontal' ? component.width : component.height;
                  update({ orientation, width: orientation === 'horizontal' ? length : 0, height: orientation === 'vertical' ? length : 0 } as Partial<ReportComponent>);
                }}
              />
            )}
          </Field>
          <p className="ar-hint">Line width, color and style come from the border settings below.</p>
        </Section>
      )}
      {component.type === 'rectangle' && (
        <Section title="Rectangle">
          <Field label={`Radius (${unit})`}>{(id) => <NumberInput id={id} optional min={0} value={component.cornerRadius} onCommit={(cornerRadius) => update({ cornerRadius } as Partial<ReportComponent>)} />}</Field>
        </Section>
      )}
      <Section title="Style">
        <Field label="Named style">
          {(id) => <SelectInput id={id} value={component.styleName} options={styles} allowEmpty="(none)" onChange={(name) => update({ styleName: name })} />}
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
          <input className="ar-input" aria-label="New style name" placeholder="style name" value={styleName} onChange={(e) => setStyleName(e.target.value)} />
          <button type="submit" className="ar-btn" disabled={!component.style}>
            Save as style
          </button>
        </form>
      </Section>
      <Section title="Behavior">
        <ExpressionField label="Visible if" value={component.visible} bandId={bandId} placeholder="always" onCommit={(visible) => update({ visible })} />
        <h4 className="ar-panel-title">Conditional styles</h4>
        {(component.conditions ?? []).map((cond, i) => (
          <div key={i} className="ar-panel-section" style={{ padding: 4 }}>
            <ExpressionField
              label="When"
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
              Remove condition
            </button>
          </div>
        ))}
        <button type="button" className="ar-btn" onClick={() => update({ conditions: [...(component.conditions ?? []), { expression: 'true', style: { color: '#b91c1c' } }] })}>
          Add condition
        </button>
      </Section>
    </>
  );
}

function SortEditor({ region }: { region: DataRegion }) {
  const { controller } = useDesignerContext();
  const rules = region.sort ?? [];
  const set = (sort: DataRegion['sort']) => controller.updateRegion(region.id, { sort: sort && sort.length ? sort : undefined });
  return (
    <>
      <h4 className="ar-panel-title">Sort</h4>
      {rules.map((rule, i) => (
        <div key={i} className="ar-field-row">
          <TextInput ariaLabel={`Sort expression ${i + 1}`} value={rule.expression} validate={validateExpression} onCommit={(expression) => set(rules.map((r, j) => (j === i ? { ...r, expression } : r)))} />
          <SelectInput ariaLabel={`Sort direction ${i + 1}`} value={rule.direction} options={SORT_DIRECTIONS} onChange={(direction) => direction && set(rules.map((r, j) => (j === i ? { ...r, direction } : r)))} />
          <button type="button" className="ar-btn" aria-label={`Remove sort ${i + 1}`} onClick={() => set(rules.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ar-btn" onClick={() => set([...rules, { expression: 'row.id', direction: 'asc' }])}>
        Add sort
      </button>
    </>
  );
}

function RegionProperties({ region }: { region: DataRegion }) {
  const { controller, state, labels } = useDesignerContext();
  const isChild = !!findRegion(state.template, region.id)?.parent;
  const [newGroup, setNewGroup] = useState('row.');
  return (
    <Section title={`Data band (${region.id})`}>
      {!isChild || region.dataSource !== undefined ? (
        <Field label="Data source">
          {(id) => (
            <SelectInput id={id} value={region.dataSource} options={state.template.dataSources.map((d) => d.name)} onChange={(dataSource) => dataSource && controller.updateRegion(region.id, { dataSource })} />
          )}
        </Field>
      ) : (
        <Field label="Relation">{(id) => <TextInput id={id} value={region.relation ?? ''} onCommit={(relation) => relation && controller.updateRegion(region.id, { relation })} />}</Field>
      )}
      <ExpressionField label="Filter" value={region.filter} bandId={region.detail.id} placeholder="all rows" onCommit={(filter) => controller.updateRegion(region.id, { filter })} />
      <SortEditor region={region} />
      <CheckInput label="Show header" checked={!!region.header} onChange={(on) => controller.setRegionBand(region.id, 'header', on)} />
      <CheckInput label="Show footer" checked={!!region.footer} onChange={(on) => controller.setRegionBand(region.id, 'footer', on)} />
      <CheckInput label="Repeat header on each page" checked={!!region.repeatHeaderOnEachPage} onChange={(on) => controller.updateRegion(region.id, { repeatHeaderOnEachPage: on || undefined })} />
      <form
        className="ar-field-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (validateExpression(newGroup)) return;
          controller.addGroup(region.id, newGroup);
          setNewGroup('row.');
        }}
      >
        <input className="ar-input" aria-label="Group expression" value={newGroup} aria-invalid={validateExpression(newGroup) ? true : undefined} onChange={(e) => setNewGroup(e.target.value)} />
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
        <SelectInput ariaLabel="Detail relation" value={value} options={arrays} onChange={(v) => setRelation(v ?? '')} />
      ) : (
        <input className="ar-input" aria-label="Detail relation" placeholder="array field" value={relation} onChange={(e) => setRelation(e.target.value)} />
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
    <Section title={`Group (${group.id})`}>
      <ExpressionField label="Group by" value={group.expression} onCommit={(expression) => expression && controller.updateGroup(group.id, { expression })} />
      <Field label="Order">{(id) => <SelectInput id={id} value={group.sortDirection ?? 'asc'} options={['asc', 'desc', 'none'] as const} onChange={(sortDirection) => controller.updateGroup(group.id, { sortDirection })} />}</Field>
      <CheckInput label="Group header" checked={!!group.header} onChange={(on) => controller.setGroupBand(group.id, 'header', on)} />
      <CheckInput label="Group footer" checked={!!group.footer} onChange={(on) => controller.setGroupBand(group.id, 'footer', on)} />
      <CheckInput label="New page for each group" checked={!!group.pageBreakBefore} onChange={(on) => controller.updateGroup(group.id, { pageBreakBefore: on || undefined })} />
      <div className="ar-field-row">
        <button type="button" className="ar-btn" onClick={() => controller.moveGroup(group.id, -1)}>
          Move out
        </button>
        <button type="button" className="ar-btn" onClick={() => controller.moveGroup(group.id, 1)}>
          Move in
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
      <Field label={`Height (${unit})`}>{(id) => <NumberInput id={id} min={0} value={band.height} onCommit={(h) => controller.resizeBand(band.id, h ?? 0)} />}</Field>
      {!isPageBand && (
        <>
          <CheckInput label="Grow to fit content" checked={band.canGrow !== false} onChange={(on) => update({ canGrow: on ? undefined : false })} />
          <CheckInput label="Shrink to content" checked={!!band.canShrink} onChange={(on) => update({ canShrink: on || undefined })} />
          <CheckInput label="Page break before" checked={!!band.pageBreakBefore} onChange={(on) => update({ pageBreakBefore: on || undefined })} />
          <CheckInput label="Page break after" checked={!!band.pageBreakAfter} onChange={(on) => update({ pageBreakAfter: on || undefined })} />
        </>
      )}
      {isPageBand && (
        <>
          <CheckInput label="Print on first page" checked={band.printOnFirstPage !== false} onChange={(on) => update({ printOnFirstPage: on ? undefined : false })} />
          <CheckInput label="Print on last page" checked={band.printOnLastPage !== false} onChange={(on) => update({ printOnLastPage: on ? undefined : false })} />
        </>
      )}
      <ExpressionField label="Visible if" value={band.visible} bandId={band.id} placeholder="always" onCommit={(visible) => update({ visible })} />
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
  const { controller, state, labels } = useDesignerContext();
  const t = state.template;
  const page = t.page;
  const custom = typeof page.size !== 'string';
  return (
    <>
      <Section title={labels.report}>
        <Field label="Name">{(id) => <TextInput id={id} value={t.name} onCommit={(name) => name.trim() && controller.updateTemplate({ name })} />}</Field>
        <Field label="Description">{(id) => <TextInput id={id} value={t.description ?? ''} onCommit={(d) => controller.updateTemplate({ description: d || undefined })} />}</Field>
        <Field label="Locale">{(id) => <TextInput id={id} value={t.locale ?? ''} placeholder="en-US" onCommit={(locale) => controller.updateTemplate({ locale: locale || undefined })} />}</Field>
        <Field label="Unit">{(id) => <SelectInput id={id} value={t.unit} options={UNITS} onChange={(unit) => unit && controller.updateTemplate({ unit })} />}</Field>
      </Section>
      <Section title="Page">
        <Field label="Size">
          {(id) => (
            <SelectInput
              id={id}
              value={custom ? 'custom' : (page.size as string)}
              options={[...PAPER_SIZE_NAMES, 'custom']}
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
            <NumberInput ariaLabel={`Page width (${t.unit})`} min={1} value={page.size.width} onCommit={(width) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), width: width ?? 1 } } })} />
            <NumberInput ariaLabel={`Page height (${t.unit})`} min={1} value={page.size.height} onCommit={(height) => controller.updateTemplate({ page: { ...page, size: { ...(page.size as { width: number; height: number }), height: height ?? 1 } } })} />
          </div>
        )}
        <Field label="Orientation">{(id) => <SelectInput id={id} value={page.orientation} options={ORIENTATIONS} onChange={(orientation) => orientation && controller.updateTemplate({ page: { ...page, orientation } })} />}</Field>
        <div className="ar-field-grid" role="group" aria-label={`Margins (${t.unit})`}>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side} className="ar-hint">
              {side}
              <NumberInput ariaLabel={`Margin ${side} (${t.unit})`} min={0} value={page.margins[side]} onCommit={(v) => controller.updateTemplate({ page: { ...page, margins: { ...page.margins, [side]: v ?? 0 } } })} />
            </label>
          ))}
        </div>
      </Section>
      <Section title="Bands">
        {(['reportHeader', 'pageHeader', 'pageFooter', 'reportFooter'] as const).map((slot) => (
          <CheckInput key={slot} label={PAGE_BAND_LABELS[slot]} checked={!!t[slot]} onChange={(on) => controller.setPageBand(slot, on)} />
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
      <Section title={`${components.length} components`}>
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
  return (
    <aside className="ar-panel ar-panel-right" aria-label={labels.properties}>
      {body ?? <ReportProperties />}
      {state.errors.length > 0 && (
        <Section title={`Template errors (${state.errors.length})`}>
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
