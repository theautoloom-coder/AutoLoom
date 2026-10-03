/**
 * A screen opened to make one thing hands that thing back to the screen that
 * opened it.
 *
 * "+ Naya banao" on the bill used to open the customer form empty (the name
 * already typed into the picker was thrown away), and saving it went on to the
 * new customer's own page. The bill was left behind as an orphan draft with no
 * grahak, and the counter hand had to find it again and pick the customer they
 * had just made. Now the form keeps the name, goes back on save, and leaves
 * the new id here for the bill to pick up when it comes back into focus.
 */
type Kind = 'customer';

const waiting = new Map<Kind, string>();

export function handBack(kind: Kind, id: string): void {
  waiting.set(kind, id);
}

export function takeBack(kind: Kind): string | null {
  const id = waiting.get(kind) ?? null;
  waiting.delete(kind);
  return id;
}
