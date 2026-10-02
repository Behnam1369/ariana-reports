import type { ReportTemplate } from '@ariana-report/core';

/** Small report: title, one data band with a header and a footer total. 3 rows fit on page 1. */
export function salesTemplate(): ReportTemplate {
  return {
    schemaVersion: 1,
    name: 'Sales',
    unit: 'pt',
    page: { size: { width: 300, height: 200 }, orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataSources: [
      {
        name: 'orders',
        fields: [
          { name: 'id', type: 'number' },
          { name: 'customer', type: 'string' },
          { name: 'total', type: 'number' },
        ],
      },
    ],
    parameters: [{ name: 'title', type: 'string', defaultValue: 'Sales report' }],
    reportHeader: {
      id: 'rh',
      height: 30,
      components: [{ id: 'title', type: 'text', x: 0, y: 0, width: 280, height: 20, text: '{{ params.title }}' }],
    },
    body: [
      {
        kind: 'dataRegion',
        id: 'orders_region',
        dataSource: 'orders',
        header: { id: 'hdr', height: 20, components: [{ id: 'h1', type: 'text', x: 0, y: 0, width: 100, height: 20, text: 'Customer' }] },
        detail: {
          id: 'detail',
          height: 40,
          components: [
            { id: 'cust', type: 'text', x: 0, y: 0, width: 100, height: 20, text: '{{ row.customer }}' },
            { id: 'tot', type: 'text', x: 180, y: 0, width: 100, height: 20, text: '{{ row.total }}', format: { type: 'number', decimals: 2 } },
          ],
        },
        footer: { id: 'ftr', height: 20, components: [{ id: 'sum', type: 'text', x: 180, y: 0, width: 100, height: 20, text: '{{ sum(rows, "total") }}' }] },
      },
    ],
  };
}

export const salesData = {
  orders: [
    { id: 1, customer: 'Contoso', total: 10 },
    { id: 2, customer: 'Fabrikam', total: 20.5 },
    { id: 3, customer: 'Northwind', total: 5 },
    { id: 4, customer: 'Tailspin', total: 7 },
    { id: 5, customer: 'Litware', total: 1 },
  ],
};
