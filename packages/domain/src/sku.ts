/**
 * SKU generation and variant naming.
 *
 * The SKU is built from the family's template so that a warehouse employee can
 * read a code off a box and know what it is. It is always editable afterwards;
 * the template only saves typing.
 *
 *   {FAMILY}-{BRAND}-{AXES}              -> LED-AFY-H4-60W
 *   {FAMILY}-{BRAND}-{VEHICLE}-{AXES}    -> MAT-ELG-CRETA-7D-BLK
 *   {FAMILY}-{BRAND}-{socket}-{wattage}W -> LED-AFY-H4-60W
 */

export type AxisValue = {
  /** Spec code, e.g. 'socket'. */
  code: string;
  /** Display value, e.g. 'H4' or '60'. */
  value: string;
  /** Short code for the chosen option, e.g. 'BLK' for Black. */
  optionCode?: string | null;
  /** Unit for number specs, e.g. 'W'. */
  unit?: string | null;
  /** Whether the spec is marked "show in variant name". */
  showInName?: boolean;
};

export type SkuContext = {
  familyCode: string;
  familyPrefix?: string | null;
  brandCode?: string | null;
  vehicleCode?: string | null;
  axes: AxisValue[];
};

/** Uppercase, strip anything that is not A-Z/0-9, and collapse. */
export function slug(value: string, maxLength = 12): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, maxLength);
}

function axisToken(axis: AxisValue): string {
  if (axis.optionCode) return slug(axis.optionCode);
  const withUnit = axis.unit ? `${axis.value}${axis.unit}` : axis.value;
  return slug(withUnit);
}

/**
 * Render a family's SKU template.
 *
 * Tokens: {FAMILY} {BRAND} {VEHICLE} {AXES} and any spec code, e.g. {socket}.
 * Unknown or empty tokens are dropped along with a dangling separator, so a
 * template written for mats still produces a clean SKU when no vehicle is set.
 */
export function renderSku(template: string, ctx: SkuContext): string {
  const axisByCode = new Map(ctx.axes.map((a) => [a.code.toLowerCase(), a]));

  const replaced = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, rawToken: string) => {
    const token = rawToken.toUpperCase();

    if (token === 'FAMILY') return slug(ctx.familyPrefix || ctx.familyCode, 6);
    if (token === 'BRAND') return slug(ctx.brandCode ?? '', 6);
    if (token === 'VEHICLE') return slug(ctx.vehicleCode ?? '', 10);
    if (token === 'AXES') {
      return ctx.axes
        .filter((a) => a.value !== '' && a.value != null)
        .map(axisToken)
        .filter(Boolean)
        .join('-');
    }

    const axis = axisByCode.get(rawToken.toLowerCase());
    return axis ? axisToken(axis) : '';
  });

  return replaced
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

/**
 * Human-readable variant name from the specs marked "show in variant name",
 * e.g. "H4 60W Pair" or "Creta 2024+ Black".
 */
export function renderVariantName(axes: AxisValue[], vehicleLabel?: string | null): string {
  const parts = axes
    .filter((a) => a.showInName !== false && a.value)
    .map((a) => (a.unit ? `${a.value}${a.unit}` : a.value));
  if (vehicleLabel) parts.unshift(vehicleLabel);
  return parts.join(' ').trim();
}

/**
 * Make a SKU unique against those already taken, by appending -2, -3, ...
 * The database also enforces uniqueness; this keeps the UI from proposing a
 * code that will be rejected on save.
 */
export function uniqueSku(base: string, taken: Set<string> | string[]): string {
  const set = taken instanceof Set ? taken : new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Every axis combination for a family, used by the "generate all variants"
 * button on the product wizard. Bulbs x sockets is the common case.
 */
export function axisCombinations(
  axes: Array<{ code: string; unit?: string | null; showInName?: boolean; values: Array<{ value: string; optionCode?: string | null }> }>
): AxisValue[][] {
  if (axes.length === 0) return [];

  let result: AxisValue[][] = [[]];
  for (const axis of axes) {
    if (axis.values.length === 0) continue;
    const next: AxisValue[][] = [];
    for (const combo of result) {
      for (const v of axis.values) {
        next.push([
          ...combo,
          {
            code: axis.code,
            value: v.value,
            optionCode: v.optionCode ?? null,
            unit: axis.unit ?? null,
            showInName: axis.showInName ?? true,
          },
        ]);
      }
    }
    result = next;
  }
  return result;
}
