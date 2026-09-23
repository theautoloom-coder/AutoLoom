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
  admin: 'Admin',
  owner: 'Maalik',
  purchase: 'Kharid',
  sales: 'Counter',
  warehouse: 'Godown',
  accounts: 'Hisaab',
  workshop: 'Workshop',
};

/** What each role does day to day, shown on the user form. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Sab kuch — staff, settings aur maal ka poora dhaancha.',
  owner: 'Staff ke alawa sab kuch. Kharid rate aur margin dikhta hai.',
  purchase: 'Purchase banata hai, maal leta hai, supplier ko paisa deta hai.',
  sales: 'Bill banata hai, payment leta hai. Rate nahi badal sakta.',
  warehouse: 'Maal leta hai, transfer karta hai, ginti karta hai. Rate nahi dikhte.',
  accounts: 'Khata, vasooli, payment aur hisaab-kitab.',
  workshop: 'Job card, workshop ka maal lagata hai, paisa leta hai.',
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
