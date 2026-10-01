import type { ReportTemplate } from '../../src/model/types';

/** A realistic sample: header, grouped order lines with master-detail items, totals. */
export function invoiceTemplate(): ReportTemplate {
  return {
    schemaVersion: 1,
    name: 'Orders by customer',
    unit: 'mm',
    locale: 'en-US',
    page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataSources: [
      {
        name: 'orders',
        path: 'sales.orders',
        fields: [
          { name: 'id', type: 'number' },
          { name: 'customer', type: 'string' },
          { name: 'date', type: 'date' },
          { name: 'total', type: 'number' },
          {
            name: 'items',
            type: 'array',
            fields: [
              { name: 'sku', type: 'string' },
              { name: 'qty', type: 'number' },
            ],
          },
        ],
      },
    ],
    parameters: [{ name: 'title', type: 'string', defaultValue: 'Sales report' }],
    styles: {
      heading: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
      cell: { fontSize: 9, padding: 1, border: { width: 0.5, color: '#d1d5db', style: 'solid', sides: ['bottom'] } },
    },
    reportHeader: {
      id: 'rh',
      height: 15,
      components: [
        { id: 'title', type: 'text', x: 0, y: 0, width: 190, height: 10, styleName: 'heading', text: '{{ params.title }}' },
      ],
    },
    pageHeader: {
      id: 'ph',
      height: 8,
      printOnFirstPage: false,
      components: [{ id: 'ph_line', type: 'line', orientation: 'horizontal', x: 0, y: 7, width: 190, height: 0 }],
    },
    pageFooter: {
      id: 'pf',
      height: 8,
      components: [
        {
          id: 'pageno',
          type: 'text',
          x: 150,
          y: 1,
          width: 40,
          height: 6,
          style: { textAlign: 'right', fontSize: 8 },
          text: 'Page {{ page.number }} of {{ page.count }}',
        },
      ],
    },
    body: [
      {
        kind: 'dataRegion',
        id: 'orders_region',
        dataSource: 'orders',
        filter: 'row.total > 0',
        sort: [{ expression: 'row.date', direction: 'asc' }],
        repeatHeaderOnEachPage: true,
        header: {
          id: 'orders_header',
          height: 7,
          style: { backgroundColor: '#f3f4f6' },
          components: [
            { id: 'h_id', type: 'text', x: 0, y: 0, width: 30, height: 7, styleName: 'cell', text: 'Order' },
            { id: 'h_total', type: 'text', x: 150, y: 0, width: 40, height: 7, styleName: 'cell', text: 'Total' },
          ],
        },
        groups: [
          {
            id: 'by_customer',
            expression: 'row.customer',
            header: {
              id: 'customer_header',
              height: 8,
              components: [
                {
                  id: 'customer_name',
                  type: 'text',
                  x: 0,
                  y: 0,
                  width: 190,
                  height: 8,
                  style: { fontWeight: 'bold' },
                  text: '{{ group.key }}',
                },
              ],
            },
            footer: {
              id: 'customer_footer',
              height: 7,
              components: [
                {
                  id: 'customer_total',
                  type: 'text',
                  x: 150,
                  y: 0,
                  width: 40,
                  height: 7,
                  format: { type: 'currency', currency: 'USD' },
                  text: '{{ sum(group.rows, r => r.total) }}',
                },
              ],
            },
          },
        ],
        detail: {
          id: 'order_detail',
          height: 7,
          components: [
            { id: 'd_id', type: 'text', x: 0, y: 0, width: 30, height: 7, styleName: 'cell', text: '#{{ row.id }}' },
            {
              id: 'd_total',
              type: 'text',
              x: 150,
              y: 0,
              width: 40,
              height: 7,
              styleName: 'cell',
              format: { type: 'currency', currency: 'USD' },
              text: '{{ row.total }}',
              conditions: [{ expression: 'row.total > 1000', style: { color: '#b91c1c', fontWeight: 'bold' } }],
            },
          ],
        },
        children: [
          {
            kind: 'dataRegion',
            id: 'items_region',
            relation: 'items',
            detail: {
              id: 'item_detail',
              height: 5,
              components: [
                { id: 'i_sku', type: 'text', x: 10, y: 0, width: 60, height: 5, text: '{{ row.sku }} x {{ row.qty }}' },
              ],
            },
          },
        ],
        footer: {
          id: 'orders_footer',
          height: 8,
          components: [
            {
              id: 'grand_total',
              type: 'text',
              x: 150,
              y: 0,
              width: 40,
              height: 8,
              format: { type: 'currency', currency: 'USD' },
              text: '{{ sum(rows, r => r.total) }}',
            },
          ],
        },
      },
    ],
    reportFooter: {
      id: 'rf',
      height: 10,
      components: [{ id: 'logo', type: 'image', x: 0, y: 0, width: 20, height: 10, src: 'data:image/png;base64,AAAA', fit: 'contain' }],
    },
  };
}
