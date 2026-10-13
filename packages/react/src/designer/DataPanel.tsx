import { useState, type FormEvent } from 'react';
import { COMPONENT_TYPES, FIELD_TYPES, findBand, type ComponentType, type FieldDefinition, type FieldType } from '@ariana-reports/core';
import { useDesignerContext, writePayload } from './context';
import { CheckInput, Field, NumberInput, Section, SelectInput, TextInput } from './inputs';
import { Icon } from '../Icon';

/** Band that click-to-add targets: the selected band, else the first detail band, else the first band. */
function targetBand(state: ReturnType<typeof useDesignerContext>['state'], sections: { band: { id: string }; role: string }[]): string | null {
  if (state.selection.bandId) return state.selection.bandId;
  return sections.find((s) => s.role === 'detail')?.band.id ?? sections[0]?.band.id ?? null;
}

export function Toolbox() {
  const { controller, state, labels } = useDesignerContext();
  return (
    <Section title={labels.components}>
      <div className="ar-toolbox">
        {COMPONENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="ar-toolbox-item"
            draggable
            onDragStart={(e) => writePayload(e.dataTransfer, { kind: 'component', type })}
            onClick={() => {
              const bandId = targetBand(state, controller.sections());
              if (bandId) controller.addComponent(bandId, type);
            }}
          >
            <Icon name={type} />
            {labels[type]}
          </button>
        ))}
      </div>
    </Section>
  );
}

function FieldTree({ fields, root, path }: { fields: FieldDefinition[]; root: string; path: string[] }) {
  const { controller, state, labels } = useDesignerContext();
  return (
    <ul className={`ar-tree${path.length === 0 ? ' ar-tree-root' : ''}`} role={path.length === 0 ? 'tree' : 'group'}>
      {fields.map((f) => {
        const fieldPath = [...path, f.name];
        const insert = () => {
          const bandId = state.selection.bandId;
          if (bandId && findBand(state.template, bandId)) controller.insertField(bandId, fieldPath, undefined, root);
        };
        return (
          <li key={f.name} role="treeitem" aria-selected={false}>
            <div
              className="ar-tree-item"
              draggable
              tabIndex={0}
              title={labels.fieldHint}
              onDragStart={(e) => writePayload(e.dataTransfer, { kind: 'field', root, path: fieldPath })}
              onDoubleClick={insert}
              onKeyDown={(e) => e.key === 'Enter' && insert()}
            >
              <Icon name="field" />
              <span>{f.name}</span>
              <span className="ar-tree-type">{f.type}</span>
            </div>
            {f.fields && f.fields.length > 0 && f.type === 'object' && <FieldTree fields={f.fields} root={root} path={fieldPath} />}
            {f.fields && f.fields.length > 0 && f.type === 'array' && <FieldTree fields={f.fields} root="row" path={[]} />}
          </li>
        );
      })}
    </ul>
  );
}

export function DataPanel() {
  const { controller, state, labels } = useDesignerContext();
  const t = state.template;
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hasSample = controller.getSampleData() !== undefined;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      controller.addDataSource({ name });
      if (hasSample) controller.inferDataSourceFields(name);
      setNewName('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Section title={labels.data}>
      {t.dataSources.map((ds) => (
        <details key={ds.name} className="ar-source" open>
          <summary>
            <Icon name="database" />
            <span>{ds.name}</span>
          </summary>
          <div className="ar-source-body">
          <Field label={labels.sourceName}>
            {(id) => <TextInput id={id} value={ds.name} onCommit={(name) => name && controller.updateDataSource(ds.name, { name })} />}
          </Field>
          <Field label={labels.sourcePath}>
            {(id) => <TextInput id={id} value={ds.path ?? ''} placeholder={ds.name} onCommit={(path) => controller.updateDataSource(ds.name, { path: path || undefined })} />}
          </Field>
          <div className="ar-field-row">
            {hasSample && (
              <button type="button" className="ar-btn" onClick={() => controller.inferDataSourceFields(ds.name)}>
                {labels.inferFields}
              </button>
            )}
            <button type="button" className="ar-btn ar-btn-danger" aria-label={`${labels.delete} ${ds.name}`} onClick={() => controller.removeDataSource(ds.name)}>
              {labels.delete}
            </button>
          </div>
          {ds.fields && ds.fields.length > 0 ? <FieldTree fields={ds.fields} root="row" path={[]} /> : <p className="ar-hint">{labels.noFields}</p>}
          </div>
        </details>
      ))}
      <form className="ar-field-row" onSubmit={add} style={{ marginTop: 8 }}>
        <input className="ar-input" aria-label={labels.newDataSourceName} placeholder={labels.namePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="ar-btn ar-btn-outline">
          <Icon name="plus" />
          {labels.addDataSource}
        </button>
      </form>
      {error && <p className="ar-field-error" role="alert">{error}</p>}
    </Section>
  );
}

export function ParametersPanel() {
  const { controller, state, labels } = useDesignerContext();
  const params = state.template.parameters ?? [];
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title={labels.parameters}>
      {params.map((p) => (
        <details key={p.name} className="ar-source">
          <summary>
            <Icon name="parameter" />
            <span>params.{p.name}</span>
          </summary>
          <div className="ar-source-body">
          <Field label={labels.parameterLabel}>{(id) => <TextInput id={id} value={p.label ?? ''} onCommit={(label) => controller.updateParameter(p.name, { label: label || undefined })} />}</Field>
          <Field label={labels.parameterType}>
            {(id) => <SelectInput id={id} value={p.type} options={FIELD_TYPES} translate onChange={(type) => type && controller.updateParameter(p.name, { type: type as FieldType })} />}
          </Field>
          <Field label={labels.defaultValue}>
            {(id) =>
              p.type === 'number' ? (
                <NumberInput id={id} optional value={typeof p.defaultValue === 'number' ? p.defaultValue : undefined} onCommit={(v) => controller.updateParameter(p.name, { defaultValue: v })} />
              ) : p.type === 'boolean' ? (
                <CheckInput label="true" checked={p.defaultValue === true} onChange={(v) => controller.updateParameter(p.name, { defaultValue: v })} />
              ) : (
                <TextInput id={id} value={p.defaultValue === undefined || p.defaultValue === null ? '' : String(p.defaultValue)} onCommit={(v) => controller.updateParameter(p.name, { defaultValue: v === '' ? undefined : v })} />
              )
            }
          </Field>
          <button type="button" className="ar-btn ar-btn-danger" aria-label={`${labels.delete} params.${p.name}`} onClick={() => controller.removeParameter(p.name)}>
            {labels.delete}
          </button>
          </div>
        </details>
      ))}
      <form
        className="ar-field-row"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          try {
            controller.addParameter({ name, type: 'string' });
            setNewName('');
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <input className="ar-input" aria-label={labels.newParameterName} placeholder={labels.namePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="ar-btn ar-btn-outline">
          <Icon name="plus" />
          {labels.addParameter}
        </button>
      </form>
      {error && <p className="ar-field-error" role="alert">{error}</p>}
    </Section>
  );
}
