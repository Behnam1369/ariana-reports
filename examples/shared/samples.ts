import journalData from './journal-entry.data.json';
import journalTemplate from './journal-entry.template.json';
import salesData from './sales.data.json';
import salesTemplate from './sales.template.json';

/** Sample reports shown by the demo apps. */
export interface Sample {
  id: string;
  label: string;
  /** Typed loosely here; the demos cast it to `ReportTemplate`. */
  template: unknown;
  data: unknown;
}

export const SAMPLES: Sample[] = [
  { id: 'sales', label: 'Sales by customer', template: salesTemplate, data: salesData },
  { id: 'journal', label: 'Journal entry', template: journalTemplate, data: journalData },
];

export const storageKey = (sampleId: string) => `ariana-report-demo-template:${sampleId}`;
