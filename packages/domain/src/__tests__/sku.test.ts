import { describe, expect, it } from 'vitest';
import { axisCombinations, renderSku, renderVariantName, uniqueSku } from '../sku';

describe('SKU templates', () => {
  it('builds a bulb SKU from socket and wattage', () => {
    const sku = renderSku('{FAMILY}-{BRAND}-{AXES}', {
      familyCode: 'LED',
      familyPrefix: 'LED',
      brandCode: 'AFY',
      axes: [
        { code: 'socket', value: 'H4', optionCode: 'H4' },
        { code: 'wattage', value: '60', unit: 'W' },
      ],
    });
    expect(sku).toBe('LED-AFY-H4-60W');
  });

  it('builds a mat SKU including the vehicle', () => {
    const sku = renderSku('{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', {
      familyCode: 'MAT',
      familyPrefix: 'MAT',
      brandCode: 'ELG',
      vehicleCode: 'CRETA',
      axes: [
        { code: 'mat_type', value: '7D', optionCode: '7D' },
        { code: 'colour', value: 'Black', optionCode: 'BLK' },
      ],
    });
    expect(sku).toBe('MAT-ELG-CRETA-7D-BLK');
  });

  it('supports naming individual specs in the template', () => {
    const sku = renderSku('{FAMILY}-{BRAND}-{socket}-{wattage}W', {
      familyCode: 'LED',
      brandCode: 'AFY',
      axes: [
        { code: 'socket', value: 'H7', optionCode: 'H7' },
        { code: 'wattage', value: '55' },
      ],
    });
    expect(sku).toBe('LED-AFY-H7-55W');
  });

  it('drops the vehicle token cleanly when the product is universal', () => {
    const sku = renderSku('{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', {
      familyCode: 'HORN',
      familyPrefix: 'HORN',
      brandCode: 'RTS',
      vehicleCode: null,
      axes: [{ code: 'horn_type', value: 'Windtone', optionCode: 'WIND' }],
    });
    expect(sku).toBe('HORN-RTS-WIND');
  });

  it('strips punctuation and spaces from values', () => {
    const sku = renderSku('{FAMILY}-{AXES}', {
      familyCode: 'ANDR',
      axes: [{ code: 'ram_rom', value: '8+128GB', optionCode: '8G128' }],
    });
    expect(sku).toBe('ANDR-8G128');
  });
});

describe('variant names', () => {
  it('reads the way a salesperson would say it', () => {
    const name = renderVariantName([
      { code: 'socket', value: 'H4' },
      { code: 'wattage', value: '60', unit: 'W' },
      { code: 'pack', value: 'Pair' },
    ]);
    expect(name).toBe('H4 60W Pair');
  });

  it('puts the vehicle first for a fitment product', () => {
    const name = renderVariantName([{ code: 'colour', value: 'Black' }], 'Creta 2024+');
    expect(name).toBe('Creta 2024+ Black');
  });

  it('skips specs that are not meant to appear in the name', () => {
    const name = renderVariantName([
      { code: 'socket', value: 'H4' },
      { code: 'lumens', value: '12000', showInName: false },
    ]);
    expect(name).toBe('H4');
  });
});

describe('SKU uniqueness', () => {
  it('returns the base SKU when it is free', () => {
    expect(uniqueSku('LED-AFY-H4-60W', [])).toBe('LED-AFY-H4-60W');
  });

  it('appends a suffix when the SKU is taken', () => {
    expect(uniqueSku('LED-AFY-H4-60W', ['LED-AFY-H4-60W'])).toBe('LED-AFY-H4-60W-2');
    expect(uniqueSku('LED-AFY-H4-60W', ['LED-AFY-H4-60W', 'LED-AFY-H4-60W-2'])).toBe('LED-AFY-H4-60W-3');
  });
});

describe('variant generation', () => {
  it('produces every socket and wattage combination for a bulb', () => {
    const combos = axisCombinations([
      { code: 'socket', values: [{ value: 'H4', optionCode: 'H4' }, { value: 'H7', optionCode: 'H7' }] },
      { code: 'wattage', unit: 'W', values: [{ value: '60' }, { value: '80' }] },
    ]);
    expect(combos).toHaveLength(4);
    expect(renderVariantName(combos[0])).toBe('H4 60W');
    expect(renderVariantName(combos[3])).toBe('H7 80W');
  });

  it('returns nothing when the family has no axes', () => {
    expect(axisCombinations([])).toEqual([]);
  });
});
