import { describe, expect, it } from 'vitest';
import {
  fitmentLabel,
  fitmentMatches,
  generationForYear,
  groupVehicleResults,
  parseVehicleSearch,
  scoreModelMatch,
  type FitmentRow,
  type GenerationRow,
} from '../fitment';

const CRETA = 'model-creta';
const GEN_2020 = 'gen-creta-2020';
const GEN_2024 = 'gen-creta-2024';

const base: FitmentRow = {
  id: 'f1',
  product_id: 'p1',
  variant_id: 'v1',
  model_id: CRETA,
  generation_id: null,
  vehicle_variant_id: null,
  year_from: null,
  year_to: null,
  position: null,
};

describe('fitment matching', () => {
  it('matches any year when the fitment names only the model', () => {
    expect(fitmentMatches(base, { model_id: CRETA, year: 2017 })).toBe(true);
  });

  it('does not match a different model', () => {
    expect(fitmentMatches(base, { model_id: 'model-swift', year: 2024 })).toBe(false);
  });

  it('matches only its own generation when pinned to one', () => {
    const pinned = { ...base, generation_id: GEN_2024 };
    expect(fitmentMatches(pinned, { model_id: CRETA, generation_id: GEN_2024 })).toBe(true);
    expect(fitmentMatches(pinned, { model_id: CRETA, generation_id: GEN_2020 })).toBe(false);
  });

  it('respects a year window written on the fitment row', () => {
    const windowed = { ...base, year_from: 2018, year_to: 2023 };
    expect(fitmentMatches(windowed, { model_id: CRETA, year: 2020 })).toBe(true);
    expect(fitmentMatches(windowed, { model_id: CRETA, year: 2024 })).toBe(false);
  });

  it('treats an open-ended window as still on sale', () => {
    const open = { ...base, year_from: 2024, year_to: null };
    expect(fitmentMatches(open, { model_id: CRETA, year: 2026 })).toBe(true);
    expect(fitmentMatches(open, { model_id: CRETA, year: 2023 })).toBe(false);
  });

  it('falls back to the generation window when the row has no years', () => {
    const gen: GenerationRow = { id: GEN_2024, model_id: CRETA, name: 'Facelift 2024+', year_from: 2024, year_to: null };
    const pinned = { ...base, generation_id: GEN_2024 };
    expect(fitmentMatches(pinned, { model_id: CRETA, year: 2022 }, gen)).toBe(false);
    expect(fitmentMatches(pinned, { model_id: CRETA, year: 2025 }, gen)).toBe(true);
  });

  it('matches a trim-specific fitment only for that trim', () => {
    const trim = { ...base, vehicle_variant_id: 'trim-sxo' };
    expect(fitmentMatches(trim, { model_id: CRETA, vehicle_variant_id: 'trim-sxo' })).toBe(true);
    expect(fitmentMatches(trim, { model_id: CRETA, vehicle_variant_id: 'trim-e' })).toBe(false);
    // No trim chosen means the salesperson has not narrowed it down yet.
    expect(fitmentMatches(trim, { model_id: CRETA })).toBe(true);
  });
});

describe('generation lookup', () => {
  const gens: GenerationRow[] = [
    { id: 'g1', model_id: CRETA, name: '1st Gen', year_from: 2015, year_to: 2019 },
    { id: 'g2', model_id: CRETA, name: '2nd Gen', year_from: 2020, year_to: 2023 },
    { id: 'g3', model_id: CRETA, name: 'Facelift 2024+', year_from: 2024, year_to: null },
  ];

  it('finds the generation on sale in a year', () => {
    expect(generationForYear(gens, 2021)?.id).toBe('g2');
    expect(generationForYear(gens, 2026)?.id).toBe('g3');
  });

  it('returns nothing for a year before the model existed', () => {
    expect(generationForYear(gens, 2010)).toBeNull();
  });

  it('prefers the newer generation at a changeover year', () => {
    const overlapping: GenerationRow[] = [
      { id: 'a', model_id: CRETA, name: 'old', year_from: 2018, year_to: 2020 },
      { id: 'b', model_id: CRETA, name: 'new', year_from: 2020, year_to: null },
    ];
    expect(generationForYear(overlapping, 2020)?.id).toBe('b');
  });
});

describe('vehicle search parsing', () => {
  it('separates the year from the model name', () => {
    expect(parseVehicleSearch('creta 2024')).toEqual({ text: 'creta', year: 2024, tokens: ['creta'] });
  });

  it('keeps a model number that is not a year', () => {
    expect(parseVehicleSearch('xuv700').year).toBeNull();
  });

  it('does not treat 1156 as a year', () => {
    expect(parseVehicleSearch('1156').year).toBeNull();
  });

  it('handles a bare model name', () => {
    expect(parseVehicleSearch('scorpio n')).toEqual({ text: 'scorpio n', year: null, tokens: ['scorpio', 'n'] });
  });
});

describe('model scoring', () => {
  it('ranks an exact name highest', () => {
    expect(scoreModelMatch('creta', 'Creta')).toBe(100);
  });

  it('ranks a prefix above a substring', () => {
    expect(scoreModelMatch('cre', 'Creta')).toBeGreaterThan(scoreModelMatch('ret', 'Creta'));
  });

  it('finds a model through an alias the shop actually types', () => {
    expect(scoreModelMatch('wagon r', 'WagonR', ['Wagon R'])).toBe(100);
    expect(scoreModelMatch('scorpio-n', 'Scorpio N', ['Scorpio-N'])).toBe(100);
  });

  it('returns zero for an unrelated term', () => {
    expect(scoreModelMatch('mat', 'Creta')).toBe(0);
  });
});

describe('result grouping', () => {
  it('keeps universal products out of the model-specific list', () => {
    const { specific, universal } = groupVehicleResults([
      { is_universal_fit: false, family_name: 'Mats' },
      { is_universal_fit: false, family_name: 'Mats' },
      { is_universal_fit: true, family_name: 'LED Bulbs' },
    ]);
    expect(specific.get('Mats')).toHaveLength(2);
    expect(universal.get('LED Bulbs')).toHaveLength(1);
    expect(specific.has('LED Bulbs')).toBe(false);
  });
});

describe('fitment labels', () => {
  it('reads as the trade writes it', () => {
    expect(fitmentLabel({ modelName: 'Creta', yearFrom: 2024, yearTo: null })).toBe('Creta 2024+');
    expect(fitmentLabel({ modelName: 'Swift', yearFrom: 2018, yearTo: 2023 })).toBe('Swift 2018-2023');
    expect(fitmentLabel({ modelName: 'Thar' })).toBe('Thar');
  });
});
