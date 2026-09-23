/**
 * CSV parsing and the import row schemas.
 *
 * Excel "Save as CSV" output is the input: commas, quoted fields with embedded
 * commas/newlines, CRLF line endings, an optional BOM. Headers are matched
 * case-insensitively with spaces and hyphens folded to underscores, so
 * "Retail Price" and "retail_price" are the same column.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function normaliseHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s\-/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Rows as objects keyed by normalised header. Empty cells become ''. */
export function csvToObjects(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const table = parseCsv(text);
  if (table.length === 0) return { headers: [], rows: [] };
  const headers = table[0].map(normaliseHeader);
  const rows = table.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = (r[i] ?? '').trim();
    });
    return o;
  });
  return { headers, rows };
}

export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  const cols = headers ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

export function parseBool(v: string | undefined): boolean | null {
  if (v == null) return null;
  const s = v.trim().toLowerCase();
  if (['y', 'yes', 'true', '1', 'haan'].includes(s)) return true;
  if (['n', 'no', 'false', '0', 'nahi'].includes(s)) return false;
  return null;
}

export function parseNumber(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Column reference for each import type, shown on the import screen and used for the templates. */
export const IMPORT_TEMPLATES = {
  products: {
    label: 'Maal aur uske type',
    description: 'Har SKU ki ek row. Jin rows ka product_name + brand + family same hai wo ek hi item mein jud jaati hain. Spec ke column mein spec code likho (socket, wattage, colour…).',
    required: ['family_code', 'product_name', 'variant_name', 'sku', 'retail_price'],
    optional: ['brand', 'description', 'hsn_code', 'gst_rate', 'universal', 'category', 'barcode', 'mrp', 'dealer_price', 'wholesale_price', 'min_selling_price', 'min_stock', 'reorder_level', 'reorder_qty', 'fitment_make', 'fitment_model', 'fitment_year_from', 'fitment_year_to', 'fitment_position', 'opening_qty', 'opening_cost', 'location_code', '<any spec code>'],
    example: [
      { family_code: 'LED', brand: 'Autofy', product_name: 'Autofy Ultra X1 LED Bulb', variant_name: 'H4 60W Pair', sku: 'LED-AFY-H4-60W', socket: 'H4', wattage: '60', pack: 'Pair', cct: '6500K Cool White', canbus: 'Yes', mrp: '3200', retail_price: '2400', dealer_price: '1900', wholesale_price: '1750', min_stock: '15', opening_qty: '25', opening_cost: '1450', location_code: 'MAIN' },
      { family_code: 'MAT', brand: 'Elegant', product_name: 'Elegant 7D Luxury Car Mat', variant_name: 'Creta 2024+ Black', sku: 'MAT-ELG-CRETA-7D-BLK', mat_type: '7D', material: 'Leatherette', colour: 'Black', rows: '3 Rows', coverage: 'Full Set', retail_price: '6200', dealer_price: '4600', fitment_make: 'Hyundai', fitment_model: 'Creta', fitment_year_from: '2024', fitment_position: 'full_set', opening_qty: '11', opening_cost: '3350', location_code: 'MAIN' },
    ],
  },
  customers: {
    label: 'Grahak',
    description: 'Har grahak ki ek row. Purana balance khata mein entry ban jaata hai (plus matlab unka aapko dena hai).',
    required: ['name'],
    optional: ['code', 'business_name', 'owner_name', 'mobile', 'alt_phone', 'email', 'gstin', 'pan', 'address_line1', 'address_line2', 'city', 'state_code', 'pincode', 'customer_type', 'price_list', 'credit_limit', 'credit_days', 'opening_balance', 'opening_balance_date', 'notes'],
    example: [{ code: 'C0001', name: 'XYZ Accessories', business_name: 'XYZ Accessories', owner_name: 'Rakesh Gupta', mobile: '9811001100', gstin: '09ABCDE1234F1Z5', city: 'Noida', state_code: '09', customer_type: 'dealer', price_list: 'dealer', credit_limit: '100000', credit_days: '30', opening_balance: '28500', opening_balance_date: '2026-04-01' }],
  },
  suppliers: {
    label: 'Supplier',
    description: 'Har supplier ki ek row. Purana balance plus matlab aapko unhe dena hai.',
    required: ['name'],
    optional: ['code', 'company_name', 'contact_person', 'mobile', 'alt_phone', 'email', 'gstin', 'pan', 'address_line1', 'address_line2', 'city', 'state_code', 'pincode', 'payment_terms_days', 'opening_balance', 'opening_balance_date', 'notes'],
    example: [{ code: 'S0001', name: 'Bright Auto Imports', company_name: 'Bright Auto Imports Pvt Ltd', mobile: '9899001100', gstin: '07AABCU9603R1ZM', city: 'New Delhi', state_code: '07', payment_terms_days: '30', opening_balance: '96000' }],
  },
  opening_stock: {
    label: 'Shuruaati stock',
    description: 'Har SKU ki har location par ek row. Shuruaati stock ke roop mein chadhta hai, aur jis SKU ka kharid rate nahi hai uska average cost bhi set kar deta hai.',
    required: ['sku', 'location_code', 'qty'],
    optional: ['unit_cost', 'note'],
    example: [{ sku: 'LED-AFY-H4-60W', location_code: 'MAIN', qty: '25', unit_cost: '1450' }],
  },
  vehicles: {
    label: 'Gaadiyan',
    description: 'Har generation ki ek row. Company aur model na hon to apne aap ban jaate hain.',
    required: ['make', 'model', 'generation', 'year_from'],
    optional: ['model_code', 'body_type', 'year_to', 'facelift', 'aliases'],
    example: [{ make: 'Hyundai', model: 'Creta', model_code: 'CRETA', body_type: 'suv', generation: 'Facelift 2024+', year_from: '2024', year_to: '', facelift: 'yes', aliases: '' }],
  },
} as const;

export type ImportType = keyof typeof IMPORT_TEMPLATES;

export function templateCsv(type: ImportType): string {
  const t = IMPORT_TEMPLATES[type];
  const headers = [...new Set([...t.required, ...t.optional.filter((h) => !h.startsWith('<')), ...t.example.flatMap((e) => Object.keys(e))])];
  return toCsv([...t.example], headers);
}
