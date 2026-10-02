import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportDesigner, ReportViewer, type ReportTemplate } from '@ariana-report/react';
import { SAMPLES, storageKey, type Sample } from '../../shared/samples';

function loadTemplate(sample: Sample): ReportTemplate {
  const saved = localStorage.getItem(storageKey(sample.id));
  return (saved ? JSON.parse(saved) : sample.template) as ReportTemplate;
}

function App() {
  const [tab, setTab] = useState<'viewer' | 'designer'>('viewer');
  const [sample, setSample] = useState<Sample>(SAMPLES[0]!);
  const [template, setTemplate] = useState<ReportTemplate>(() => loadTemplate(SAMPLES[0]!));
  // Bumped on reset or report change so the designer starts over.
  const [version, setVersion] = useState(0);

  const pick = (id: string) => {
    const next = SAMPLES.find((s) => s.id === id)!;
    setSample(next);
    setTemplate(loadTemplate(next));
    setVersion((v) => v + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #ddd', font: '14px system-ui' }} aria-label="Demo">
        <strong style={{ marginRight: 16 }}>ariana-report · React</strong>
        <label>
          Report{' '}
          <select value={sample.id} onChange={(e) => pick(e.target.value)}>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" aria-pressed={tab === 'viewer'} onClick={() => setTab('viewer')}>
          Viewer
        </button>
        <button type="button" aria-pressed={tab === 'designer'} onClick={() => setTab('designer')}>
          Designer
        </button>
        <button
          type="button"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            localStorage.removeItem(storageKey(sample.id));
            setTemplate(sample.template as ReportTemplate);
            setVersion((v) => v + 1);
          }}
        >
          Reset sample
        </button>
      </nav>
      <main style={{ flex: 1, minHeight: 0 }}>
        {tab === 'viewer' ? (
          <ReportViewer key={sample.id} template={template} data={sample.data} zoomMode="fitWidth" onError={(e) => console.error(e)} />
        ) : (
          <ReportDesigner
            key={`${sample.id}:${version}`}
            template={template}
            sampleData={sample.data}
            onSave={(t, json) => {
              // A real app would send `json` to its backend.
              localStorage.setItem(storageKey(sample.id), json);
              setTemplate(t);
            }}
          />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
