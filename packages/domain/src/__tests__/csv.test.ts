import { describe, expect, it } from 'vitest';
import { csvToObjects, normaliseHeader, parseBool, parseCsv, parseNumber, templateCsv, toCsv } from '../csv';

describe('CSV parsing', () => {
  it('parses Excel output with CRLF, quotes and a BOM', () => {
    const text = '﻿sku,name,price\r\nLED-1,"Bulb, H4",2400\r\nMAT-1,"7D ""Luxury"" Mat",6200\r\n';
    expect(parseCsv(text)).toEqual([
      ['sku', 'name', 'price'],
      ['LED-1', 'Bulb, H4', '2400'],
      ['MAT-1', '7D "Luxury" Mat', '6200'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([['a', 'b'], ['line1\nline2', 'x']]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n   ,\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('maps rows to objects with normalised headers', () => {
    const { headers, rows } = csvToObjects('Product Name,Retail Price,Min-Stock\nBulb,2400,15');
    expect(headers).toEqual(['product_name', 'retail_price', 'min_stock']);
    expect(rows[0]).toEqual({ product_name: 'Bulb', retail_price: '2400', min_stock: '15' });
  });

  it('normalises headers the way people type them', () => {
    expect(normaliseHeader(' Fitment Year From ')).toBe('fitment_year_from');
    expect(normaliseHeader('GST%')).toBe('gst');
  });

  it('round-trips through toCsv', () => {
    const csv = toCsv([{ a: 'x,y', b: 'he said "hi"' }]);
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x,y', 'he said "hi"']]);
  });
});

describe('cell parsing', () => {
  it('reads yes/no in the ways staff write them', () => {
    expect(parseBool('Yes')).toBe(true);
    expect(parseBool('N')).toBe(false);
    expect(parseBool('haan')).toBe(true);
    expect(parseBool('maybe')).toBeNull();
  });

  it('reads rupee amounts with commas and symbols', () => {
    expect(parseNumber('₹1,42,300')).toBe(142300);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('templates', () => {
  it('produces a header row plus example rows for every type', () => {
    for (const type of ['products', 'customers', 'suppliers', 'opening_stock', 'vehicles'] as const) {
      const rows = parseCsv(templateCsv(type));
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows[0]).toContain(type === 'opening_stock' ? 'sku' : type === 'vehicles' ? 'make' : type === 'products' ? 'family_code' : 'name');
    }
  });
});
