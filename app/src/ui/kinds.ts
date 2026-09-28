/**
 * What each kind of entry is called, and what it looks like.
 *
 * One definition, because Home and Parchi both render the same feed and the
 * only thing stopping them calling the same event two different names is that
 * they read this. It lived in both files as a copy; a comment saying "change
 * both" is a weaker promise than having one to change.
 */
import type { IconName } from './index';

export type EntryKind = 'sale' | 'purchase' | 'expense' | 'payment' | 'damage' | 'adjust';

export const KIND: Record<string, { label: string; icon: IconName; accent: string; sign: '+' | '−' | '' }> = {
  sale: { label: 'Maal gaya', icon: 'arrow-up-circle-outline', accent: 'blue', sign: '' },
  purchase: { label: 'Maal aaya', icon: 'arrow-down-circle-outline', accent: 'green', sign: '' },
  expense: { label: 'Kharcha', icon: 'wallet-outline', accent: 'amber', sign: '−' },
  payment: { label: 'Payment', icon: 'cash-outline', accent: 'teal', sign: '' },
  damage: { label: 'Kharab maal', icon: 'alert-circle-outline', accent: 'rose', sign: '' },
  adjust: { label: 'Stock sudhar', icon: 'swap-vertical-outline', accent: 'violet', sign: '' },
};

/** The clock on a feed row. Shared so one entry shows the same time everywhere. */
export function clockOf(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
