import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportDesigner, ReportViewer, type ReportTemplate } from '@ariana-report/react';
import data from '../../shared/sales.data.json';
import initialTemplate from '../../shared/sales.template.json';

const STORAGE_KEY = 'ariana-report-demo-template';

function loadTemplate(): ReportTemplate {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? (JSON.parse(saved) as ReportTemplate) : (initialTemplate as ReportTemplate);
}

function App() {
  const [tab, setTab] = useState<'viewer' | 'designer'>('viewer');
  const [template, setTemplate] = useState<ReportTemplate>(loadTemplate);
  // Bumped on reset so the designer starts over with the sample template.
  const [version, setVersion] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <nav style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd', font: '14px system-ui' }} aria-label="Demo">
        <strong style={{ marginRight: 16 }}>ariana-report · React</strong>
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
            localStorage.removeItem(STORAGE_KEY);
            setTemplate(initialTemplate as ReportTemplate);
            setVersion((v) => v + 1);
          }}
        >
          Reset sample
        </button>
      </nav>
      <main style={{ flex: 1, minHeight: 0 }}>
        {tab === 'viewer' ? (
          <ReportViewer template={template} data={data} zoomMode="fitWidth" onError={(e) => console.error(e)} />
        ) : (
          <ReportDesigner
            key={version}
            template={template}
            sampleData={data}
            onSave={(t, json) => {
              // A real app would send `json` to its backend.
              localStorage.setItem(STORAGE_KEY, json);
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
