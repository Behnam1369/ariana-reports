/**
 * Templates and data used by the live demos and the examples gallery.
 * Everything here is plain JSON-compatible data: the same objects could be
 * loaded from files or a server.
 */
import type { Band, ReportComponent, ReportTemplate } from '@ariana-reports/core';

type Text = Extract<ReportComponent, { type: 'text' }>;

const text = (id: string, x: number, y: number, width: number, height: number, t: string, extra: Partial<Text> = {}): Text => ({
  id,
  type: 'text',
  x,
  y,
  width,
  height,
  text: t,
  ...extra,
});

const page = (margin = 12) => ({
  size: 'A4' as const,
  orientation: 'portrait' as const,
  margins: { top: margin, right: margin, bottom: margin, left: margin },
});

const baseStyles = {
  title: { fontSize: 18, fontWeight: 'bold' as const, color: '#0f172a' },
  muted: { fontSize: 9, color: '#64748b' },
  th: { fontSize: 9, fontWeight: 'bold' as const, color: '#ffffff', backgroundColor: '#334155', padding: 1.5 },
  td: { fontSize: 9, padding: 1.5, border: { width: 0.4, color: '#e2e8f0', style: 'solid' as const, sides: ['bottom' as const] } },
  num: { textAlign: 'right' as const },
  sub: { fontSize: 9, fontWeight: 'bold' as const, backgroundColor: '#e2e8f0', padding: 1.5 },
};

const pageFooter = (id = 'pf'): Band => ({
  id,
  height: 8,
  components: [text('pf_n', 0, 2, 186, 5, 'Page {{ page.number }} of {{ page.count }}', { style: { fontSize: 8, color: '#64748b', textAlign: 'right' } })],
});

// ---------------------------------------------------------------------------
// 1. Product catalog: a long table, to try scrolling through pages
// ---------------------------------------------------------------------------

const categories = ['Hardware', 'Software', 'Services', 'Accessories'];
export const productsData = {
  products: Array.from({ length: 140 }, (_, i) => ({
    sku: `SKU-${String(1000 + i * 7)}`,
    name: ['Wireless mouse', 'Mechanical keyboard', 'USB-C dock', 'Webcam HD', 'Monitor stand', 'Laptop sleeve', 'Headset', 'Cloud backup', 'Support plan', 'Desk lamp'][i % 10] + ` ${Math.floor(i / 10) + 1}`,
    category: categories[i % 4],
    price: Math.round((12 + ((i * 37) % 180) + (i % 3) * 0.99) * 100) / 100,
    stock: (i * 13) % 90,
  })),
};

export const productsTemplate: ReportTemplate = {
  schemaVersion: 1,
  name: 'Product catalog',
  unit: 'mm',
  page: page(),
  dataSources: [{ name: 'products' }],
  styles: baseStyles,
  reportHeader: {
    id: 'rh',
    height: 18,
    components: [
      text('title', 0, 0, 186, 9, 'Product catalog', { styleName: 'title' }),
      text('sub', 0, 10, 186, 5, '{{ count(products) }} products · printed {{ formatDate(today(), "d MMMM yyyy") }}', { styleName: 'muted' }),
    ],
  },
  pageFooter: pageFooter(),
  body: [
    {
      kind: 'dataRegion',
      id: 'list',
      dataSource: 'products',
      repeatHeaderOnEachPage: true,
      header: {
        id: 'head',
        height: 7,
        components: [
          text('h1', 0, 0, 28, 7, 'SKU', { styleName: 'th' }),
          text('h2', 28, 0, 72, 7, 'Product', { styleName: 'th' }),
          text('h3', 100, 0, 34, 7, 'Category', { styleName: 'th' }),
          text('h4', 134, 0, 26, 7, 'Price', { styleName: 'th', style: { textAlign: 'right' } }),
          text('h5', 160, 0, 26, 7, 'In stock', { styleName: 'th', style: { textAlign: 'right' } }),
        ],
      },
      detail: {
        id: 'row',
        height: 6.5,
        components: [
          text('c1', 0, 0, 28, 6.5, '{{ row.sku }}', { styleName: 'td' }),
          text('c2', 28, 0, 72, 6.5, '{{ row.name }}', { styleName: 'td' }),
          text('c3', 100, 0, 34, 6.5, '{{ row.category }}', { styleName: 'td' }),
          text('c4', 134, 0, 26, 6.5, '{{ row.price }}', { styleName: 'td', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
          text('c5', 160, 0, 26, 6.5, '{{ row.stock }}', {
            styleName: 'td',
            style: { textAlign: 'right' },
            conditions: [{ expression: 'row.stock < 10', style: { color: '#b91c1c', fontWeight: 'bold' } }],
          }),
        ],
      },
      footer: {
        id: 'foot',
        height: 8,
        components: [
          text('f1', 0, 1.5, 134, 6, 'Total stock value', { styleName: 'sub' }),
          text('f2', 134, 1.5, 52, 6, '{{ sum(rows, r => r.price * r.stock) }}', { styleName: 'sub', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. Sales grouped by customer, with subtotals
// ---------------------------------------------------------------------------

export const salesData = {
  orders: [
    { id: 1001, customer: 'Contoso Ltd', date: '2026-01-08', product: 'Cloud backup', amount: 480 },
    { id: 1002, customer: 'Fabrikam', date: '2026-01-11', product: 'USB-C dock', amount: 129.9 },
    { id: 1003, customer: 'Contoso Ltd', date: '2026-01-15', product: 'Support plan', amount: 1200 },
    { id: 1004, customer: 'Northwind', date: '2026-01-19', product: 'Monitor stand', amount: 54.5 },
    { id: 1005, customer: 'Fabrikam', date: '2026-02-02', product: 'Headset', amount: 89 },
    { id: 1006, customer: 'Northwind', date: '2026-02-05', product: 'Webcam HD', amount: 75.25 },
    { id: 1007, customer: 'Contoso Ltd', date: '2026-02-10', product: 'Laptop sleeve', amount: 39 },
    { id: 1008, customer: 'Tailspin', date: '2026-02-14', product: 'Mechanical keyboard', amount: 149 },
    { id: 1009, customer: 'Tailspin', date: '2026-02-21', product: 'Wireless mouse', amount: 35.5 },
    { id: 1010, customer: 'Fabrikam', date: '2026-02-27', product: 'Desk lamp', amount: 42 },
  ],
};

export const salesTemplate: ReportTemplate = {
  schemaVersion: 1,
  name: 'Sales by customer',
  unit: 'mm',
  page: page(),
  dataSources: [{ name: 'orders' }],
  styles: baseStyles,
  reportHeader: {
    id: 'rh',
    height: 16,
    components: [
      text('title', 0, 0, 186, 9, 'Sales by customer', { styleName: 'title' }),
      text('sub', 0, 10, 186, 5, '{{ count(orders) }} orders from {{ distinct(orders, "customer").length }} customers', { styleName: 'muted' }),
    ],
  },
  pageFooter: pageFooter(),
  body: [
    {
      kind: 'dataRegion',
      id: 'orders_region',
      dataSource: 'orders',
      sort: [{ expression: 'row.date', direction: 'asc' }],
      groups: [
        {
          id: 'by_customer',
          expression: 'row.customer',
          header: {
            id: 'gh',
            height: 8,
            components: [text('gh1', 0, 1, 186, 6, '{{ group.key }}', { style: { fontSize: 11, fontWeight: 'bold', color: '#1d4ed8', padding: 1 } })],
          },
          footer: {
            id: 'gf',
            height: 8,
            components: [
              text('gf1', 0, 1, 134, 6, 'Subtotal ({{ group.count }} orders)', { styleName: 'sub' }),
              text('gf2', 134, 1, 52, 6, '{{ sum(group.rows, "amount") }}', { styleName: 'sub', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
            ],
          },
        },
      ],
      header: {
        id: 'head',
        height: 7,
        components: [
          text('h1', 0, 0, 22, 7, 'Order', { styleName: 'th' }),
          text('h2', 22, 0, 30, 7, 'Date', { styleName: 'th' }),
          text('h3', 52, 0, 82, 7, 'Product', { styleName: 'th' }),
          text('h4', 134, 0, 52, 7, 'Amount', { styleName: 'th', style: { textAlign: 'right' } }),
        ],
      },
      detail: {
        id: 'row',
        height: 6.5,
        components: [
          text('c1', 0, 0, 22, 6.5, '#{{ row.id }}', { styleName: 'td' }),
          text('c2', 22, 0, 30, 6.5, '{{ row.date }}', { styleName: 'td', format: { type: 'date', pattern: 'dd MMM yyyy' } }),
          text('c3', 52, 0, 82, 6.5, '{{ row.product }}', { styleName: 'td' }),
          text('c4', 134, 0, 52, 6.5, '{{ row.amount }}', { styleName: 'td', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
        ],
      },
      footer: {
        id: 'foot',
        height: 10,
        components: [
          text('f1', 0, 2, 134, 7, 'Grand total', { style: { fontSize: 11, fontWeight: 'bold', backgroundColor: '#1e293b', color: '#fff', padding: 1.5 } }),
          text('f2', 134, 2, 52, 7, '{{ sum(rows, "amount") }}', { style: { fontSize: 11, fontWeight: 'bold', backgroundColor: '#1e293b', color: '#fff', padding: 1.5, textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Master-detail: orders with their line items
// ---------------------------------------------------------------------------

export const ordersData = {
  orders: [
    {
      id: 'A-2041',
      customer: 'Contoso Ltd',
      date: '2026-03-02',
      items: [
        { sku: 'KB-100', name: 'Mechanical keyboard', qty: 4, price: 149 },
        { sku: 'MS-020', name: 'Wireless mouse', qty: 4, price: 35.5 },
        { sku: 'DK-300', name: 'USB-C dock', qty: 2, price: 129.9 },
      ],
    },
    {
      id: 'A-2042',
      customer: 'Fabrikam',
      date: '2026-03-03',
      items: [
        { sku: 'HS-410', name: 'Headset', qty: 10, price: 89 },
        { sku: 'WC-220', name: 'Webcam HD', qty: 10, price: 75.25 },
      ],
    },
    {
      id: 'A-2043',
      customer: 'Northwind',
      date: '2026-03-07',
      items: [
        { sku: 'MN-501', name: 'Monitor stand', qty: 6, price: 54.5 },
        { sku: 'DL-009', name: 'Desk lamp', qty: 6, price: 42 },
        { sku: 'LS-777', name: 'Laptop sleeve', qty: 6, price: 39 },
        { sku: 'SP-001', name: 'Support plan (1 year)', qty: 1, price: 1200 },
      ],
    },
  ],
};

export const ordersTemplate: ReportTemplate = {
  schemaVersion: 1,
  name: 'Orders with items',
  unit: 'mm',
  page: page(),
  dataSources: [{ name: 'orders' }],
  styles: baseStyles,
  reportHeader: { id: 'rh', height: 14, components: [text('title', 0, 0, 186, 9, 'Orders with items', { styleName: 'title' })] },
  pageFooter: pageFooter(),
  body: [
    {
      kind: 'dataRegion',
      id: 'orders_region',
      dataSource: 'orders',
      detail: {
        id: 'order',
        height: 9,
        components: [
          text('o1', 0, 2, 40, 6, 'Order {{ row.id }}', { style: { fontSize: 11, fontWeight: 'bold', color: '#1d4ed8' } }),
          text('o2', 40, 2, 80, 6, '{{ row.customer }}', { style: { fontSize: 11, fontWeight: 'bold' } }),
          text('o3', 120, 2, 66, 6, '{{ row.date }}', { style: { fontSize: 9, color: '#64748b', textAlign: 'right' }, format: { type: 'date', pattern: 'd MMMM yyyy' } }),
        ],
      },
      children: [
        {
          kind: 'dataRegion',
          id: 'items_region',
          relation: 'items',
          detail: {
            id: 'item',
            height: 6,
            components: [
              text('i1', 6, 0, 26, 6, '{{ row.sku }}', { styleName: 'td' }),
              text('i2', 32, 0, 84, 6, '{{ row.name }}', { styleName: 'td' }),
              text('i3', 116, 0, 20, 6, '{{ row.qty }}', { styleName: 'td', style: { textAlign: 'right' } }),
              text('i4', 136, 0, 25, 6, '{{ row.price }}', { styleName: 'td', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
              text('i5', 161, 0, 25, 6, '{{ row.qty * row.price }}', { styleName: 'td', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
            ],
          },
          footer: {
            id: 'items_total',
            height: 9,
            components: [
              text('t1', 116, 1.5, 45, 6, 'Order total', { styleName: 'sub', style: { textAlign: 'right' } }),
              text('t2', 161, 1.5, 25, 6, '{{ sum(rows, r => r.qty * r.price) }}', { styleName: 'sub', style: { textAlign: 'right' }, format: { type: 'currency', currency: 'USD' } }),
            ],
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Conditional styling: invoices by status
// ---------------------------------------------------------------------------

export const invoicesData = {
  invoices: [
    { no: 'INV-0412', client: 'Contoso Ltd', due: '2026-02-01', amount: 4200, status: 'paid' },
    { no: 'INV-0413', client: 'Fabrikam', due: '2026-02-15', amount: 980.5, status: 'overdue' },
    { no: 'INV-0414', client: 'Northwind', due: '2026-03-01', amount: 15250, status: 'open' },
    { no: 'INV-0415', client: 'Tailspin', due: '2026-03-12', amount: 310, status: 'paid' },
    { no: 'INV-0416', client: 'Litware', due: '2026-03-20', amount: 7800, status: 'overdue' },
    { no: 'INV-0417', client: 'Contoso Ltd', due: '2026-04-02', amount: 2650, status: 'open' },
  ],
};

export const invoicesTemplate: ReportTemplate = {
  schemaVersion: 1,
  name: 'Invoice status',
  unit: 'mm',
  page: page(),
  dataSources: [{ name: 'invoices' }],
  styles: baseStyles,
  reportHeader: {
    id: 'rh',
    height: 22,
    components: [
      text('title', 0, 0, 186, 9, 'Invoice status', { styleName: 'title' }),
      text('sub', 0, 10, 186, 10, '{{ count(invoices, r => r.status === "overdue") }} overdue invoices, {{ formatCurrency(sum(invoices, r => r.status === "overdue" ? r.amount : 0), "USD") }} outstanding', {
        styleName: 'muted',
        style: { fontSize: 10 },
        conditions: [{ expression: 'invoices.some(r => r.status === "overdue")', style: { color: '#b91c1c' } }],
      }),
    ],
  },
  pageFooter: pageFooter(),
  body: [
    {
      kind: 'dataRegion',
      id: 'list',
      dataSource: 'invoices',
      header: {
        id: 'head',
        height: 7,
        components: [
          text('h1', 0, 0, 30, 7, 'Invoice', { styleName: 'th' }),
          text('h2', 30, 0, 60, 7, 'Client', { styleName: 'th' }),
          text('h3', 90, 0, 30, 7, 'Due', { styleName: 'th' }),
          text('h4', 120, 0, 36, 7, 'Amount', { styleName: 'th', style: { textAlign: 'right' } }),
          text('h5', 156, 0, 30, 7, 'Status', { styleName: 'th', style: { textAlign: 'center' } }),
        ],
      },
      detail: {
        id: 'row',
        height: 7,
        components: [
          text('c1', 0, 0, 30, 7, '{{ row.no }}', { styleName: 'td' }),
          text('c2', 30, 0, 60, 7, '{{ row.client }}', { styleName: 'td' }),
          text('c3', 90, 0, 30, 7, '{{ row.due }}', { styleName: 'td', format: { type: 'date', pattern: 'dd MMM yyyy' } }),
          text('c4', 120, 0, 36, 7, '{{ row.amount }}', {
            styleName: 'td',
            style: { textAlign: 'right' },
            format: { type: 'currency', currency: 'USD' },
            // Large amounts are bold.
            conditions: [{ expression: 'row.amount >= 5000', style: { fontWeight: 'bold' } }],
          }),
          text('c5', 156, 0, 30, 7, '{{ upper(row.status) }}', {
            styleName: 'td',
            style: { textAlign: 'center', fontWeight: 'bold', fontSize: 8 },
            conditions: [
              { expression: 'row.status === "paid"', style: { color: '#15803d', backgroundColor: '#dcfce7' } },
              { expression: 'row.status === "overdue"', style: { color: '#b91c1c', backgroundColor: '#fee2e2' } },
              { expression: 'row.status === "open"', style: { color: '#a16207', backgroundColor: '#fef9c3' } },
            ],
          }),
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. HTML formatting inside text (allowHtml)
// ---------------------------------------------------------------------------

export const notesData = {
  customer: { name: 'Contoso Ltd', contact: 'Ada Lovelace' },
  tasks: [
    { title: 'Renew <b>support plan</b>', note: 'Expires <font color="#b91c1c">31 March</font>.<br>Call before the <u>end of the month</u>.' },
    { title: 'Send <i>price list</i>', note: 'Include the <b>new</b> hardware range and mention the <s>old</s> discount of <b>15%</b>.' },
    { title: 'Prepare <span style="color:#1d4ed8;font-weight:bold">onboarding</span> call', note: 'Agenda:<br>1. Accounts<br>2. Training<br>3. Q&amp;A' },
  ],
};

export const notesTemplate: ReportTemplate = {
  schemaVersion: 1,
  name: 'Account notes',
  unit: 'mm',
  page: { size: 'A5', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
  dataSources: [{ name: 'tasks' }, { name: 'customer' }],
  styles: { ...baseStyles, note: { fontSize: 9.5, padding: 1.5 } },
  reportHeader: {
    id: 'rh',
    height: 22,
    components: [
      text('title', 0, 0, 124, 9, 'Account notes', { styleName: 'title' }),
      text('who', 0, 10, 124, 10, '<b>{{ customer.name }}</b><br>Contact: {{ customer.contact }}', { allowHtml: true, canGrow: true, styleName: 'muted', style: { fontSize: 10 } }),
    ],
  },
  body: [
    {
      kind: 'dataRegion',
      id: 'tasks_region',
      dataSource: 'tasks',
      detail: {
        id: 'task',
        height: 24,
        components: [
          text('n1', 0, 1, 124, 6, '{{ rowNumber }}. {{ row.title }}', { allowHtml: true, style: { fontSize: 11, fontWeight: 'bold' } }),
          text('n2', 5, 8, 119, 14, '{{ row.note }}', { allowHtml: true, canGrow: true, styleName: 'note' }),
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. Persian: another locale for numbers, dates and the user interface
// ---------------------------------------------------------------------------

export const persianData = {
  sales: [
    { customer: 'شرکت آریا', product: 'لپ‌تاپ', qty: 12, price: 485000000, date: '2026-03-21' },
    { customer: 'فروشگاه پارس', product: 'مانیتور', qty: 30, price: 128500000, date: '2026-03-23' },
    { customer: 'شرکت آریا', product: 'کیبورد', qty: 40, price: 9800000, date: '2026-03-25' },
    { customer: 'دانش‌گستر', product: 'هدست', qty: 25, price: 17400000, date: '2026-04-01' },
    { customer: 'فروشگاه پارس', product: 'وب‌کم', qty: 18, price: 12300000, date: '2026-04-03' },
  ],
};

const fa = { fontFamily: 'Vazirmatn' };
export const persianTemplate: ReportTemplate = {
  schemaVersion: 1,
  name: 'گزارش فروش',
  unit: 'mm',
  // Numbers and dates are formatted with the Persian locale.
  locale: 'fa-IR',
  page: page(),
  dataSources: [{ name: 'sales' }],
  styles: {
    title: { ...fa, fontSize: 18, fontWeight: 'bold', textAlign: 'right' },
    th: { ...fa, fontSize: 9, fontWeight: 'bold', color: '#fff', backgroundColor: '#334155', padding: 1.5, textAlign: 'right' },
    td: { ...fa, fontSize: 9.5, padding: 1.5, textAlign: 'right', border: { width: 0.4, color: '#e2e8f0', style: 'solid', sides: ['bottom'] } },
    sub: { ...fa, fontSize: 10, fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: 1.5, textAlign: 'right' },
  },
  reportHeader: {
    id: 'rh',
    height: 18,
    components: [
      text('title', 0, 0, 186, 10, 'گزارش فروش', { styleName: 'title' }),
      text('sub', 0, 11, 186, 5, '{{ count(sales) }} سفارش · تاریخ گزارش: {{ formatDate(today(), "d MMMM yyyy", "persian") }}', { style: { ...fa, fontSize: 9.5, color: '#64748b', textAlign: 'right' } }),
    ],
  },
  body: [
    {
      kind: 'dataRegion',
      id: 'list',
      dataSource: 'sales',
      header: {
        id: 'head',
        height: 7,
        components: [
          text('h1', 0, 0, 40, 7, 'تاریخ', { styleName: 'th' }),
          text('h2', 40, 0, 40, 7, 'قیمت واحد', { styleName: 'th' }),
          text('h3', 80, 0, 20, 7, 'تعداد', { styleName: 'th' }),
          text('h4', 100, 0, 36, 7, 'کالا', { styleName: 'th' }),
          text('h5', 136, 0, 50, 7, 'مشتری', { styleName: 'th' }),
        ],
      },
      detail: {
        id: 'row',
        height: 7,
        components: [
          text('c1', 0, 0, 40, 7, '{{ row.date }}', { styleName: 'td', format: { type: 'date', pattern: 'yyyy/MM/dd', calendar: 'persian' } }),
          text('c2', 40, 0, 40, 7, '{{ row.price }}', { styleName: 'td', format: { type: 'number', decimals: 0, thousandsSeparator: true } }),
          text('c3', 80, 0, 20, 7, '{{ row.qty }}', { styleName: 'td' }),
          text('c4', 100, 0, 36, 7, '{{ row.product }}', { styleName: 'td' }),
          text('c5', 136, 0, 50, 7, '{{ row.customer }}', { styleName: 'td' }),
        ],
      },
      footer: {
        id: 'foot',
        height: 10,
        components: [
          text('f1', 0, 2, 80, 7, '{{ sum(rows, r => r.qty * r.price) }}', { styleName: 'sub', format: { type: 'number', decimals: 0, thousandsSeparator: true } }),
          text('f2', 80, 2, 106, 7, 'جمع کل (ریال)', { styleName: 'sub' }),
        ],
      },
    },
  ],
};

/** Everything the gallery and the playground offer. */
export interface Example {
  id: string;
  title: string;
  description: string;
  template: ReportTemplate;
  data: unknown;
  /** Features worth looking at in this example. */
  tags: string[];
}

export const examples: Example[] = [
  { id: 'products', title: 'Product catalog', description: 'A 140-row table over several pages with a repeating header, page numbers, conditional red stock levels and a total.', template: productsTemplate, data: productsData, tags: ['pagination', 'conditional style', 'footer totals'] },
  { id: 'sales', title: 'Sales by customer', description: 'Groups with a header and a subtotal footer per customer, sorted rows and a grand total.', template: salesTemplate, data: salesData, tags: ['groups', 'sorting', 'subtotals'] },
  { id: 'orders', title: 'Orders with items', description: 'Master-detail: every order row is followed by its line items and an order total.', template: ordersTemplate, data: ordersData, tags: ['master-detail', 'nested data'] },
  { id: 'invoices', title: 'Invoice status', description: 'Conditional styles colour the status cell and highlight large amounts and overdue invoices.', template: invoicesTemplate, data: invoicesData, tags: ['conditions', 'currency'] },
  { id: 'notes', title: 'Account notes', description: 'Text with bold, italic, underline, colour and line breaks through the allowHtml option.', template: notesTemplate, data: notesData, tags: ['allowHtml', 'A5'] },
  { id: 'persian', title: 'گزارش فروش (Persian)', description: 'Persian text and digits through the fa-IR locale, Jalali (Persian calendar) dates, and a right-aligned layout.', template: persianTemplate, data: persianData, tags: ['locale', 'fa-IR', 'Jalali calendar'] },
];

export const exampleById = (id: string): Example => {
  const hit = examples.find((e) => e.id === id);
  if (!hit) throw new Error(`Unknown example "${id}"`);
  return hit;
};
