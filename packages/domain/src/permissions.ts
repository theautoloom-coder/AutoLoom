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
  'purchase.create',
  'purchase.cancel',
  'sale.create',
  'sale.override_price',
  'sale.override_credit',
  'sale.cancel',
  'sale.return',
  'payment.receive',
  'payment.pay_supplier',
  // Money out that is not a supplier payment: transport, packing, an advance.
  // Separate from pay_supplier so a counter hand can write down the chai
  // without also being able to settle a supplier's account.
  'expense.record',
  'stock.transfer',
  'stock.count',
  'stock.adjust',
  'party.edit',
  'party.edit_credit_limit',
  'jobcard.edit',
  'reports.view',
  'reports.view_margin',
  'admin.users',
  'admin.settings',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['admin', 'owner', 'purchase', 'sales', 'warehouse', 'accounts', 'workshop'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  owner: 'Owner',
  purchase: 'Purchase',
  sales: 'Sales',
  warehouse: 'Warehouse',
  accounts: 'Accounts',
  workshop: 'Workshop',
};

/** What each role does day to day, shown on the user form. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full access including users, settings and the catalogue structure.',
  owner: 'Everything except user administration. Sees cost and margin.',
  purchase: 'Creates purchases, receives stock, pays suppliers.',
  sales: 'Bills customers, receives payments, cannot change master prices.',
  warehouse: 'Receives, transfers and counts stock. Cannot see or change prices.',
  accounts: 'Ledgers, collections, payments and reports.',
  workshop: 'Job cards, consumes stock at the workshop, takes payment.',
};

export function can(permissions: Iterable<string>, permission: Permission): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(permission);
}

export function canAny(permissions: Iterable<string>, required: Permission[]): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return required.some((p) => set.has(p));
}

/** Which tabs a role sees, so a warehouse phone is not full of billing screens. */
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
    stock: set.has('purchase.create') || set.has('stock.transfer') || set.has('stock.count'),
    parties: set.has('party.edit') || set.has('payment.receive') || set.has('payment.pay_supplier'),
    reports: set.has('reports.view'),
    admin: set.has('admin.settings') || set.has('admin.users') || set.has('catalog.edit'),
  };
}
