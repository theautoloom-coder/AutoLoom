/**
 * Permission names and role defaults.
 *
 * The database is the authority (`role_permissions` + row level security).
 * This module gives the app the same names so screens can hide what a user
 * cannot do, instead of letting them try and get an error.
 */

export const PERMISSIONS = [
  'catalog.view',
  'catalog.edit',
  'catalog.edit_price',
  'catalog.view_cost',
  // Add a kism (another car, colour, socket) to an existing item while writing
  // stock in. Insert only — changing or removing a kism stays catalog.edit.
  'catalog.add_kism',
  'purchase.create',
  // Stock a staff member writes in waits until an owner or admin checks the
  // count, puts the buy rate on it and approves. Only then does it count.
  'purchase.approve',
  'purchase.cancel',
  'sale.create',
  'sale.override_price',
  'sale.override_credit',
  'sale.cancel',
  'sale.return',
  'payment.receive',
  'payment.pay_supplier',
  // Money out that is not a supplier payment: transport, packing, an advance.
  // Separate from pay_supplier so a staff member can write down the chai
  // without also being able to settle a supplier's account.
  'expense.record',
  'stock.transfer',
  'stock.count',
  // Kharab Likho: put broken or missing maal aside. Narrower than
  // stock.adjust, which opens every kind of correction.
  'stock.damage',
  'stock.adjust',
  'party.edit',
  'party.edit_credit_limit',
  'jobcard.edit',
  'reports.view',
  'reports.view_margin',
  // What each partner put into the business or took out of it.
  'partner.capital',
  'admin.users',
  'admin.settings',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * AutoLoom is a wholesaler with partners and a few staff (owner, 6 Oct 2026).
 * The older roles (purchase, sales, warehouse, accounts, workshop) still exist
 * in old rows but grant nothing — see migration 20261007100000.
 */
export const ROLES = ['owner', 'admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Partner',
  admin: 'Admin',
  staff: 'Staff',
};

/** What each role does day to day, shown on the user form. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Maalik. Sab kuch dekhta hai — kharid rate, munafa, partner ka paisa. Staff ka maal approve karta hai.',
  admin: 'Maalik jaisa hi — staff, settings, approval. Partner ke paise ka hisaab bhi.',
  staff: 'Maal aaya to ginke likhta hai, bill banata hai, paisa leta hai, kharcha likhta hai. Rate aur munafa nahi dikhta.',
};

/** A role's label, for any role name including the retired ones. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return (ROLE_LABELS as Record<string, string>)[role] ?? 'Staff';
}

export function can(permissions: Iterable<string>, permission: Permission): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(permission);
}

export function canAny(permissions: Iterable<string>, required: Permission[]): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return required.some((p) => set.has(p));
}

/** Which tabs a role sees. */
export function visibleSections(permissions: Iterable<string>): {
  home: boolean;
  search: boolean;
  sell: boolean;
  stock: boolean;
  parties: boolean;
  reports: boolean;
  admin: boolean;
} {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return {
    home: true,
    search: true,
    sell: set.has('sale.create'),
    stock: set.has('purchase.create') || set.has('stock.count') || set.has('stock.damage'),
    parties: set.has('party.edit') || set.has('payment.receive') || set.has('payment.pay_supplier'),
    reports: set.has('reports.view'),
    admin: set.has('admin.settings') || set.has('admin.users') || set.has('catalog.edit'),
  };
}

/**
 * What a document's status is called on screen.
 *
 * The stored values stay English — they are what every query, policy and
 * posting function compares against, and renaming them would be a migration
 * with nothing to gain. This is the display layer only.
 */
export const STATUS_LABELS: Record<string, string> = {
  draft: 'adhoora',
  posted: 'post ho gaya',
  open: 'khula hai',
  closed: 'band',
  cancelled: 'cancel',
  dispatched: 'bhej diya',
  received: 'aa gaya',
  settled: 'chukta',
  partial: 'thoda jama',
  paid: 'jama',
  pending: 'baaki hai',
  approved: 'haan',
  rejected: 'mana',
  missing: 'kam nikla',
  ready: 'tayyar',
  in_progress: 'chal raha hai',
  active: 'chalu',
  inactive: 'band',
};

/** The label for a status, falling back to the raw value for anything new. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return '';
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}
