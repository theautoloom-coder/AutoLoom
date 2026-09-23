/**
 * Dynamic specifications: validation, display and filtering.
 *
 * A bulb and a mat share no fields, so nothing here knows what a bulb is.
 * The family's spec_definitions drive the form, the display and the filters.
 */

export type SpecDataType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect';

export type SpecDefinition = {
  id: string;
  family_id: string;
  code: string;
  name: string;
  data_type: SpecDataType;
  unit: string | null;
  is_required: boolean;
  is_variant_axis: boolean;
  is_filterable: boolean;
  show_in_variant_name: boolean;
  sort_order: number;
};

export type SpecOption = {
  id: string;
  spec_definition_id: string;
  value: string;
  code: string | null;
  aliases: string | null;
  sort_order: number;
  is_active: boolean;
};

export type SpecValue = {
  spec_definition_id: string;
  value_text?: string | null;
  value_number?: number | null;
  value_bool?: boolean | null;
  option_id?: string | null;
  option_ids?: string | null;
  display_value?: string | null;
};

/** What a spec value should read as on screen: "H4", "60 W", "Yes". */
export function displayValue(def: SpecDefinition, value: SpecValue, options: SpecOption[] = []): string {
  switch (def.data_type) {
    case 'select': {
      const opt = options.find((o) => o.id === value.option_id);
      return opt?.value ?? value.display_value ?? '';
    }
    case 'multiselect': {
      const ids = (value.option_ids ?? '').split(',').filter(Boolean);
      const names = ids.map((id) => options.find((o) => o.id === id)?.value).filter(Boolean);
      return names.join(', ');
    }
    case 'number':
      if (value.value_number == null) return '';
      return def.unit ? `${value.value_number} ${def.unit}` : String(value.value_number);
    case 'boolean':
      if (value.value_bool == null) return '';
      return value.value_bool ? 'Yes' : 'No';
    default:
      return value.value_text ?? '';
  }
}

export type ValidationError = { code: string; name: string; message: string };

/**
 * Check a filled spec form against its family's definitions.
 * Returns one message per problem, ready to show under each field.
 */
export function validateSpecs(
  definitions: SpecDefinition[],
  values: Map<string, SpecValue>,
  opts: { onlyAxes?: boolean; onlyNonAxes?: boolean } = {}
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const def of definitions) {
    if (opts.onlyAxes && !def.is_variant_axis) continue;
    if (opts.onlyNonAxes && def.is_variant_axis) continue;

    const value = values.get(def.id);
    const empty =
      value == null ||
      (def.data_type === 'number' && value.value_number == null) ||
      (def.data_type === 'boolean' && value.value_bool == null) ||
      (def.data_type === 'select' && !value.option_id) ||
      (def.data_type === 'multiselect' && !value.option_ids) ||
      (def.data_type === 'text' && !value.value_text?.trim());

    if (def.is_required && empty) {
      errors.push({ code: def.code, name: def.name, message: `${def.name} is required` });
      continue;
    }

    if (!empty && def.data_type === 'number' && value!.value_number != null) {
      if (!Number.isFinite(value!.value_number)) {
        errors.push({ code: def.code, name: def.name, message: `${def.name} must be a number` });
      } else if (value!.value_number < 0) {
        errors.push({ code: def.code, name: def.name, message: `${def.name} cannot be negative` });
      }
    }
  }

  return errors;
}

/** Definitions that create variants, in form order. */
export function axisDefinitions(definitions: SpecDefinition[]): SpecDefinition[] {
  return definitions.filter((d) => d.is_variant_axis).sort((a, b) => a.sort_order - b.sort_order);
}

/** Definitions entered once on the product, in form order. */
export function productDefinitions(definitions: SpecDefinition[]): SpecDefinition[] {
  return definitions.filter((d) => !d.is_variant_axis).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Overlay variant-level values on product-level ones. A variant may override
 * anything it inherits, which is how "this one size is fanless" is expressed
 * without splitting the product.
 */
export function effectiveSpecs(
  productValues: SpecValue[],
  variantValues: SpecValue[]
): Map<string, SpecValue> {
  const merged = new Map<string, SpecValue>();
  for (const v of productValues) merged.set(v.spec_definition_id, v);
  for (const v of variantValues) merged.set(v.spec_definition_id, v);
  return merged;
}

export type FilterChip = {
  definition: SpecDefinition;
  options: Array<{ id: string; label: string; count: number }>;
};

/**
 * Build the filter chips shown above a product list: only filterable specs
 * that actually vary across the results, with a count per option.
 */
export function buildFilters(
  definitions: SpecDefinition[],
  options: SpecOption[],
  rows: Array<{ specs: Map<string, SpecValue> }>
): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const def of definitions.filter((d) => d.is_filterable).sort((a, b) => a.sort_order - b.sort_order)) {
    if (def.data_type !== 'select' && def.data_type !== 'multiselect') continue;

    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = row.specs.get(def.id);
      if (!v?.option_id) continue;
      counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
    }
    if (counts.size < 2) continue; // nothing to choose between

    const defOptions = options
      .filter((o) => o.spec_definition_id === def.id && counts.has(o.id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ id: o.id, label: o.value, count: counts.get(o.id) ?? 0 }));

    chips.push({ definition: def, options: defOptions });
  }

  return chips;
}

/** Does a row satisfy every active filter? Filters combine with AND. */
export function matchesFilters(specs: Map<string, SpecValue>, active: Map<string, Set<string>>): boolean {
  for (const [defId, optionIds] of active) {
    if (optionIds.size === 0) continue;
    const value = specs.get(defId);
    if (!value) return false;

    if (value.option_id && optionIds.has(value.option_id)) continue;

    const many = (value.option_ids ?? '').split(',').filter(Boolean);
    if (many.some((id) => optionIds.has(id))) continue;

    return false;
  }
  return true;
}

/**
 * Search tokens for a spec option, including trade synonyms.
 * "9005" and "HB3" are the same socket, and staff type either.
 */
export function optionSearchTokens(option: SpecOption): string[] {
  const tokens = [option.value.toLowerCase()];
  if (option.code) tokens.push(option.code.toLowerCase());
  if (option.aliases) tokens.push(...option.aliases.toLowerCase().split(/[\s|,]+/).filter(Boolean));
  return [...new Set(tokens)];
}

/**
 * Compare rows of the same family side by side: one column per spec that is
 * present on at least one row. Used by the salesperson's comparison table.
 */
export function comparisonColumns(
  definitions: SpecDefinition[],
  rows: Array<{ specs: Map<string, SpecValue> }>
): SpecDefinition[] {
  return definitions
    .filter((d) => rows.some((r) => r.specs.has(d.id)))
    .sort((a, b) => a.sort_order - b.sort_order);
}
