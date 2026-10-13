import { useState } from 'react';
import { ReportDesigner, type ReportTemplate } from '@ariana-reports/react';
import { salesData, salesTemplate } from '../data';

export default function DesignerBasic() {
  const [template, setTemplate] = useState<ReportTemplate>(salesTemplate);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* The template prop is only the starting point; changes are reported through onChange. */}
        <ReportDesigner
          template={salesTemplate}
          sampleData={salesData}
          onChange={setTemplate}
          onSave={async (_template, json) => {
            // Send `json` to your backend here.
            console.log('save', json.length, 'bytes');
          }}
        />
      </div>
      <div style={{ padding: '4px 10px', background: '#fff', font: '12px system-ui', color: '#555' }}>
        Template JSON: {JSON.stringify(template).length} characters
      </div>
    </div>
  );
}
