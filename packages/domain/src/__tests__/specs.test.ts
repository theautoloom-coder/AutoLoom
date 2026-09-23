import { describe, expect, it } from 'vitest';
import {
  axisDefinitions,
  buildFilters,
  comparisonColumns,
  displayValue,
  effectiveSpecs,
  matchesFilters,
  optionSearchTokens,
  validateSpecs,
  type SpecDefinition,
  type SpecOption,
} from '../specs';

function def(partial: Partial<SpecDefinition> & { id: string; code: string; data_type: SpecDefinition['data_type'] }): SpecDefinition {
  return {
    family_id: 'fam-led',
    name: partial.code,
    unit: null,
    is_required: false,
    is_variant_axis: false,
    is_filterable: true,
    show_in_variant_name: false,
    sort_order: 0,
    ...partial,
  } as SpecDefinition;
}

const socket = def({ id: 'd-socket', code: 'socket', name: 'Socket / Base', data_type: 'select', is_required: true, is_variant_axis: true, sort_order: 1 });
const wattage = def({ id: 'd-watt', code: 'wattage', name: 'Wattage', data_type: 'number', unit: 'W', is_required: true, is_variant_axis: true, sort_order: 2 });
const canbus = def({ id: 'd-canbus', code: 'canbus', name: 'CANBUS', data_type: 'select', sort_order: 3 });
const chip = def({ id: 'd-chip', code: 'chip', name: 'LED Chip', data_type: 'text', sort_order: 4 });

const options: SpecOption[] = [
  { id: 'o-h4', spec_definition_id: 'd-socket', value: 'H4', code: 'H4', aliases: 'h4 hb2 9003', sort_order: 1, is_active: true },
  { id: 'o-h7', spec_definition_id: 'd-socket', value: 'H7', code: 'H7', aliases: null, sort_order: 2, is_active: true },
  { id: 'o-hb3', spec_definition_id: 'd-socket', value: 'HB3', code: 'HB3', aliases: '9005 hb3', sort_order: 3, is_active: true },
  { id: 'o-yes', spec_definition_id: 'd-canbus', value: 'Yes', code: 'YES', aliases: null, sort_order: 1, is_active: true },
  { id: 'o-no', spec_definition_id: 'd-canbus', value: 'No', code: 'NO', aliases: null, sort_order: 2, is_active: true },
];

describe('display', () => {
  it('shows the option label for a dropdown', () => {
    expect(displayValue(socket, { spec_definition_id: socket.id, option_id: 'o-h4' }, options)).toBe('H4');
  });

  it('appends the unit to a number', () => {
    expect(displayValue(wattage, { spec_definition_id: wattage.id, value_number: 60 }, options)).toBe('60 W');
  });

  it('shows an empty string rather than undefined for a missing value', () => {
    expect(displayValue(chip, { spec_definition_id: chip.id }, options)).toBe('');
  });
});

describe('validation', () => {
  it('requires the socket on a bulb', () => {
    const errors = validateSpecs([socket, wattage], new Map());
    expect(errors.map((e) => e.code)).toEqual(['socket', 'wattage']);
  });

  it('passes when the required axes are filled', () => {
    const values = new Map([
      [socket.id, { spec_definition_id: socket.id, option_id: 'o-h4' }],
      [wattage.id, { spec_definition_id: wattage.id, value_number: 60 }],
    ]);
    expect(validateSpecs([socket, wattage], values)).toEqual([]);
  });

  it('rejects a negative wattage', () => {
    const values = new Map([
      [socket.id, { spec_definition_id: socket.id, option_id: 'o-h4' }],
      [wattage.id, { spec_definition_id: wattage.id, value_number: -5 }],
    ]);
    expect(validateSpecs([socket, wattage], values)[0].message).toContain('negative');
  });

  it('can check only the product-level specs while the wizard is on that step', () => {
    const errors = validateSpecs([socket, wattage, canbus], new Map(), { onlyNonAxes: true });
    expect(errors).toEqual([]);
  });
});

describe('product and variant levels', () => {
  it('lets a variant override an inherited spec', () => {
    const merged = effectiveSpecs(
      [{ spec_definition_id: canbus.id, option_id: 'o-yes' }],
      [{ spec_definition_id: canbus.id, option_id: 'o-no' }]
    );
    expect(merged.get(canbus.id)?.option_id).toBe('o-no');
  });

  it('keeps product specs the variant does not mention', () => {
    const merged = effectiveSpecs(
      [{ spec_definition_id: chip.id, value_text: 'CSP 3570' }],
      [{ spec_definition_id: socket.id, option_id: 'o-h4' }]
    );
    expect(merged.size).toBe(2);
  });

  it('separates the axes from the shared specs', () => {
    expect(axisDefinitions([socket, wattage, canbus, chip]).map((d) => d.code)).toEqual(['socket', 'wattage']);
  });
});

describe('filters', () => {
  const rows = [
    { specs: new Map([[socket.id, { spec_definition_id: socket.id, option_id: 'o-h4' }], [canbus.id, { spec_definition_id: canbus.id, option_id: 'o-yes' }]]) },
    { specs: new Map([[socket.id, { spec_definition_id: socket.id, option_id: 'o-h7' }], [canbus.id, { spec_definition_id: canbus.id, option_id: 'o-yes' }]]) },
    { specs: new Map([[socket.id, { spec_definition_id: socket.id, option_id: 'o-h4' }], [canbus.id, { spec_definition_id: canbus.id, option_id: 'o-no' }]]) },
  ];

  it('offers a chip per spec that actually varies, with counts', () => {
    const chips = buildFilters([socket, canbus], options, rows);
    const socketChip = chips.find((c) => c.definition.code === 'socket');
    expect(socketChip?.options).toEqual([
      { id: 'o-h4', label: 'H4', count: 2 },
      { id: 'o-h7', label: 'H7', count: 1 },
    ]);
  });

  it('hides a chip when every row has the same value', () => {
    const uniform = [rows[0], rows[1]];
    const chips = buildFilters([socket, canbus], options, uniform);
    expect(chips.some((c) => c.definition.code === 'canbus')).toBe(false);
  });

  it('combines active filters with AND', () => {
    const active = new Map([
      [socket.id, new Set(['o-h4'])],
      [canbus.id, new Set(['o-yes'])],
    ]);
    expect(matchesFilters(rows[0].specs, active)).toBe(true);
    expect(matchesFilters(rows[2].specs, active)).toBe(false);
  });

  it('ignores an empty filter', () => {
    expect(matchesFilters(rows[0].specs, new Map([[socket.id, new Set<string>()]]))).toBe(true);
  });
});

describe('trade synonyms', () => {
  it('finds HB3 when the customer says 9005', () => {
    const tokens = optionSearchTokens(options[2]);
    expect(tokens).toContain('9005');
    expect(tokens).toContain('hb3');
  });
});

describe('comparison table', () => {
  it('shows only the columns the compared products use', () => {
    const rows = [
      { specs: new Map([[socket.id, { spec_definition_id: socket.id, option_id: 'o-h4' }]]) },
      { specs: new Map([[wattage.id, { spec_definition_id: wattage.id, value_number: 60 }]]) },
    ];
    expect(comparisonColumns([socket, wattage, chip], rows).map((d) => d.code)).toEqual(['socket', 'wattage']);
  });
});
