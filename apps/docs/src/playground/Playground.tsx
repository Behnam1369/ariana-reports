import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DARK_THEME,
  DesignerController,
  ReportDesigner,
  ReportViewer,
  themeFromMui,
  useStore,
  validateTemplate,
  type ArianaTheme,
  type ReportTemplate,
} from '@ariana-reports/react';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/700.css';
import { exampleById, examples } from '../demos/data';
import { generateCode, type Framework, type ThemeName } from './codegen';
import { decodeState, encodeState } from './share';
import VueHost from './VueHost';
import './playground.css';

type Tab = 'designer' | 'viewer' | 'template' | 'data' | 'code';

const TABS: [Tab, string][] = [
  ['designer', 'Designer'],
  ['viewer', 'Viewer'],
  ['template', 'Template JSON'],
  ['data', 'Data JSON'],
  ['code', 'Code'],
];

// Looks like a Material UI theme; shows what themeFromMui does.
const GRAPE: ArianaTheme = themeFromMui({
  palette: { mode: 'light', primary: { main: '#7b1fa2' }, background: { default: '#f3e5f5', paper: '#ffffff' } },
  shape: { borderRadius: 14 },
});

/** Shared links can carry images; only inline images are loaded, so opening a link never contacts another server. */
const inlineImagesOnly = (src: string) => /^data:image\/(png|jpe?g|gif|webp);/i.test(src.trim());

const PLAYGROUND_PREVIEW = { allowImageSrc: inlineImagesOnly };
const FONTS = ['Vazirmatn'];

function useSiteDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setDark(el.dataset.theme === 'dark'));
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

const stringify = (value: unknown) => JSON.stringify(value, null, 2);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFile(accept: string, onText: (text: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => void input.files?.[0]?.text().then(onText);
  input.click();
}

export default function Playground() {
  const initial = useMemo(() => {
    const id = new URLSearchParams(location.search).get('example');
    return examples.find((e) => e.id === id) ?? exampleById('sales');
  }, []);

  const [controller] = useState(() => new DesignerController({ template: structuredClone(initial.template), sampleData: initial.data }));
  const state = useStore(controller);

  const [exampleId, setExampleId] = useState(initial.id);
  const [data, setData] = useState<unknown>(initial.data);
  const [dataText, setDataText] = useState(() => stringify(initial.data));
  const [dataError, setDataError] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<string | null>(null);
  const [templateErrors, setTemplateErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('designer');
  const [framework, setFramework] = useState<Framework>(() => (localStorage.getItem('ar-playground-framework') === 'vue' ? 'vue' : 'react'));
  const [uiLocale, setUiLocale] = useState('en');
  const [themeName, setThemeName] = useState<ThemeName>('auto');
  const [toast, setToast] = useState<string | null>(null);
  const siteDark = useSiteDark();
  const applyTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3500);
  }, []);

  const theme = useMemo<ArianaTheme | undefined>(() => {
    const effective = themeName === 'auto' ? (siteDark ? 'dark' : 'light') : themeName;
    return effective === 'dark' ? DARK_THEME : effective === 'grape' ? GRAPE : undefined;
  }, [themeName, siteDark]);

  const setFrameworkPersist = (value: Framework) => {
    setFramework(value);
    localStorage.setItem('ar-playground-framework', value);
  };

  const replaceData = useCallback((value: unknown) => {
    setData(value);
    setDataText(stringify(value));
    setDataError(null);
  }, []);

  const loadExample = (id: string) => {
    if (state.dirty && !window.confirm('Discard the changes you made to this report?')) return;
    const example = exampleById(id);
    controller.load(structuredClone(example.template));
    replaceData(example.data);
    setExampleId(id);
    setTemplateDraft(null);
    setTemplateErrors([]);
    history.replaceState(null, '', `?example=${id}`);
  };

  // Open a shared link (#s=…).
  useEffect(() => {
    const match = /^#s=(.+)$/.exec(location.hash);
    if (!match) return;
    decodeState(match[1]!)
      .then((shared) => {
        controller.load(shared.template as ReportTemplate);
        replaceData(shared.data);
        if (shared.framework === 'react' || shared.framework === 'vue') setFramework(shared.framework);
        if (shared.tab && TABS.some(([t]) => t === shared.tab)) setTab(shared.tab as Tab);
        if (shared.uiLocale === 'fa' || shared.uiLocale === 'en') setUiLocale(shared.uiLocale);
        if (shared.theme && ['auto', 'light', 'dark', 'grape'].includes(shared.theme)) setThemeName(shared.theme as ThemeName);
        setExampleId('');
        notify('Opened a shared playground link');
      })
      .catch((error: Error) => notify(`Could not open the link: ${error.message}`));
  }, [controller, replaceData, notify]);

  const share = async () => {
    try {
      const encoded = await encodeState({ v: 1, template: state.template, data, framework, tab, uiLocale, theme: themeName });
      const url = `${location.origin}${location.pathname}#s=${encoded}`;
      history.replaceState(null, '', url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      notify(url.length > 60_000 ? 'Link copied, but it is very long. Some chat apps may cut it.' : 'Link copied to the clipboard');
    } catch (error) {
      notify(`Could not create the link: ${(error as Error).message}`);
    }
  };

  // -- template editor -----------------------------------------------------------
  const templateJson = useMemo(() => stringify(state.template), [state.template]);

  const editTemplate = (text: string) => {
    setTemplateDraft(text);
    window.clearTimeout(applyTimer.current);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setTemplateErrors([`Invalid JSON: ${(error as Error).message}`]);
      return;
    }
    const result = validateTemplate(parsed);
    if (!result.valid) {
      setTemplateErrors(result.errors.slice(0, 8).map((e) => `${e.path || '(template)'}: ${e.message}`));
      return;
    }
    setTemplateErrors([]);
    applyTimer.current = window.setTimeout(() => controller.load(parsed as ReportTemplate), 500);
  };

  // -- data editor ---------------------------------------------------------------
  const editData = (text: string) => {
    setDataText(text);
    try {
      setData(JSON.parse(text));
      setDataError(null);
    } catch (error) {
      setDataError(`Invalid JSON: ${(error as Error).message}`);
    }
  };

  const code = useMemo(
    () => generateCode({ framework, uiLocale, theme: themeName, fonts: JSON.stringify(state.template).includes('Vazirmatn') }),
    [framework, uiLocale, themeName, state.template],
  );

  const sharedProps = { uiLocale, theme };

  return (
    <div className="pg">
      <header className="pg-bar">
        <a className="pg-brand" href="/">
          ariana-report
        </a>
        <label>
          Example
          <select value={exampleId} onChange={(e) => loadExample(e.target.value)}>
            {exampleId === '' && <option value="">Shared link</option>}
            {examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <div className="pg-seg" role="group" aria-label="Framework">
          {(['react', 'vue'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={framework === f} onClick={() => setFrameworkPersist(f)}>
              {f === 'react' ? 'React' : 'Vue'}
            </button>
          ))}
        </div>
        <label>
          Interface
          <select value={uiLocale} onChange={(e) => setUiLocale(e.target.value)}>
            <option value="en">English</option>
            <option value="fa">فارسی</option>
          </select>
        </label>
        <label>
          Theme
          <select value={themeName} onChange={(e) => setThemeName(e.target.value as ThemeName)}>
            <option value="auto">Match site</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="grape">Material-style purple</option>
          </select>
        </label>
        <span className="pg-spacer" />
        <button type="button" className="pg-primary" onClick={() => void share()}>
          Share link
        </button>
        <a className="pg-link" href="/getting-started/introduction/">
          Docs
        </a>
      </header>

      <nav className="pg-tabs" role="tablist" aria-label="Playground views">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setTemplateDraft(null);
            }}
          >
            {label}
          </button>
        ))}
        <span className="pg-spacer" />
        <span className="pg-note">
          {framework === 'react' ? 'React' : 'Vue'} · {state.dirty ? 'edited' : 'unchanged'}
        </span>
      </nav>

      <main className="pg-stage">
        {tab === 'designer' &&
          (framework === 'react' ? (
            <ReportDesigner key="react-designer" controller={controller} sampleData={data} fonts={FONTS} preview={PLAYGROUND_PREVIEW} {...sharedProps} />
          ) : (
            <VueHost key="vue-designer" kind="designer" props={{ controller, sampleData: data, fonts: FONTS, preview: PLAYGROUND_PREVIEW, ...sharedProps }} />
          ))}

        {tab === 'viewer' &&
          (framework === 'react' ? (
            <ReportViewer key="react-viewer" template={state.template} data={data} allowImageSrc={inlineImagesOnly} showIssues {...sharedProps} />
          ) : (
            <VueHost key="vue-viewer" kind="viewer" props={{ template: state.template, data, allowImageSrc: inlineImagesOnly, showIssues: true, ...sharedProps }} />
          ))}

        {tab === 'template' && (
          <div className="pg-editor">
            <div className="pg-editor-bar">
              <span>Edit the template as JSON. Valid changes apply to the designer and viewer.</span>
              <span className="pg-spacer" />
              <button type="button" onClick={() => readFile('.json,application/json', (text) => editTemplate(text))}>
                Open file…
              </button>
              <button type="button" onClick={() => download(`${state.template.name || 'report'}.template.json`, templateJson)}>
                Download
              </button>
            </div>
            <textarea
              aria-label="Template JSON"
              spellCheck={false}
              value={templateDraft ?? templateJson}
              onChange={(e) => editTemplate(e.target.value)}
              onBlur={() => templateErrors.length === 0 && setTemplateDraft(null)}
            />
            {templateErrors.length > 0 && (
              <ul className="pg-errors" role="alert">
                {templateErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'data' && (
          <div className="pg-editor">
            <div className="pg-editor-bar">
              <span>Any JSON. Data sources in the template are paths into it.</span>
              <span className="pg-spacer" />
              <button type="button" onClick={() => readFile('.json,application/json', editData)}>
                Open file…
              </button>
              <button type="button" onClick={() => download('report.data.json', dataText)}>
                Download
              </button>
            </div>
            <textarea aria-label="Data JSON" spellCheck={false} value={dataText} onChange={(e) => editData(e.target.value)} />
            {dataError && (
              <ul className="pg-errors" role="alert">
                <li>{dataError}</li>
              </ul>
            )}
          </div>
        )}

        {tab === 'code' && (
          <div className="pg-editor">
            <div className="pg-editor-bar">
              <span>
                Starter code for your settings in {framework === 'react' ? 'React' : 'Vue'}. Download the template and data from their tabs.
              </span>
              <span className="pg-spacer" />
              <button type="button" onClick={() => void navigator.clipboard?.writeText(code).then(() => notify('Code copied'))}>
                Copy
              </button>
            </div>
            <pre className="pg-code" tabIndex={0}>
              <code>{code}</code>
            </pre>
          </div>
        )}
      </main>

      {toast && (
        <div className="pg-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
