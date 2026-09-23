/**
 * Vehicle fitment matching and vehicle search parsing.
 *
 * "Creta 2024" typed into one box has to become: make Hyundai, model Creta,
 * generation "Facelift 2024+", year 2024 — and then find every product that
 * fits it, without the vehicle name ever having been part of a product name.
 */

export type FitmentRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  model_id: string;
  generation_id: string | null;
  vehicle_variant_id: string | null;
  year_from: number | null;
  year_to: number | null;
  position: string | null;
};

export type GenerationRow = {
  id: string;
  model_id: string;
  name: string;
  year_from: number;
  year_to: number | null;
};

export type VehicleQuery = {
  model_id: string;
  generation_id?: string | null;
  vehicle_variant_id?: string | null;
  year?: number | null;
};

/** Does this fitment row cover the vehicle the salesperson is looking at? */
export function fitmentMatches(fitment: FitmentRow, query: VehicleQuery, generation?: GenerationRow | null): boolean {
  if (fitment.model_id !== query.model_id) return false;

  // A fitment pinned to a generation only matches that generation.
  if (fitment.generation_id && query.generation_id && fitment.generation_id !== query.generation_id) {
    return false;
  }

  // A fitment pinned to one trim only matches that trim (or an unspecified trim).
  if (fitment.vehicle_variant_id && query.vehicle_variant_id && fitment.vehicle_variant_id !== query.vehicle_variant_id) {
    return false;
  }

  // Year window on the fitment row, if the row carries one.
  const year = query.year ?? null;
  if (year != null && (fitment.year_from != null || fitment.year_to != null)) {
    if (fitment.year_from != null && year < fitment.year_from) return false;
    if (fitment.year_to != null && year > fitment.year_to) return false;
  }

  // Otherwise fall back to the generation's own window.
  if (year != null && fitment.year_from == null && fitment.year_to == null && generation) {
    if (year < generation.year_from) return false;
    if (generation.year_to != null && year > generation.year_to) return false;
  }

  return true;
}

/** Pick the generation of a model that was on sale in a given year. */
export function generationForYear(generations: GenerationRow[], year: number): GenerationRow | null {
  const matches = generations.filter((g) => year >= g.year_from && (g.year_to == null || year <= g.year_to));
  if (matches.length === 0) return null;
  // Prefer the newest one when generations overlap at a changeover year.
  return matches.sort((a, b) => b.year_from - a.year_from)[0];
}

/** Human label for a fitment row: "Creta 2024+" or "Swift 2018-2023". */
export function fitmentLabel(args: {
  modelName: string;
  generationName?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
}): string {
  const { modelName, yearFrom, yearTo } = args;
  if (yearFrom == null && yearTo == null) return modelName;
  if (yearTo == null) return `${modelName} ${yearFrom}+`;
  if (yearFrom == null) return `${modelName} upto ${yearTo}`;
  if (yearFrom === yearTo) return `${modelName} ${yearFrom}`;
  return `${modelName} ${yearFrom}-${yearTo}`;
}

export type ParsedVehicleSearch = {
  /** The text with any year removed, to match against model names. */
  text: string;
  year: number | null;
  tokens: string[];
};

/**
 * Split "creta 2024" into a model term and a year.
 * A four-digit number between 1990 and next year is treated as a model year.
 */
export function parseVehicleSearch(input: string): ParsedVehicleSearch {
  const maxYear = new Date().getFullYear() + 1;
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);

  let year: number | null = null;
  const rest: string[] = [];

  for (const token of tokens) {
    const n = Number(token);
    if (/^\d{4}$/.test(token) && n >= 1990 && n <= maxYear) {
      year = n;
    } else {
      rest.push(token);
    }
  }

  return { text: rest.join(' '), year, tokens: rest };
}

/**
 * Score a model name against a search term so "creta" ranks the Creta above
 * models that merely contain the letters. Returns 0 when there is no match.
 */
export function scoreModelMatch(searchText: string, modelName: string, aliases: string[] = []): number {
  const term = searchText.trim().toLowerCase();
  if (!term) return 0;

  const candidates = [modelName.toLowerCase(), ...aliases.map((a) => a.toLowerCase())];
  let best = 0;
  for (const c of candidates) {
    if (c === term) best = Math.max(best, 100);
    else if (c.startsWith(term)) best = Math.max(best, 80);
    else if (c.includes(term)) best = Math.max(best, 60);
    else if (term.includes(c)) best = Math.max(best, 40);
  }
  return best;
}

/**
 * Group products found for a vehicle: model-specific first, universal last.
 * This is what stops 400 bulbs from burying the four mats that actually fit.
 */
export function groupVehicleResults<T extends { is_universal_fit: boolean; family_name: string }>(
  rows: T[]
): { specific: Map<string, T[]>; universal: Map<string, T[]> } {
  const specific = new Map<string, T[]>();
  const universal = new Map<string, T[]>();

  for (const row of rows) {
    const target = row.is_universal_fit ? universal : specific;
    const list = target.get(row.family_name) ?? [];
    list.push(row);
    target.set(row.family_name, list);
  }
  return { specific, universal };
}
