/**
 * Who is signed in, what they may do, and where they work.
 *
 * The Supabase session is the identity. The profile and permission rows come
 * from the LOCAL database, so a phone that lost signal still knows the user's
 * role and default location. Until the first sync completes the permission
 * set is empty and the UI stays read-only, which is the safe default.
 */
import { useQuery } from '@powersync/react';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { can, type Permission, type Role } from '@domain';

import { defaultDeviceName, devicePlatform, getDeviceId } from './device';
import { supabase } from './supabase';
import { useSystem } from './system';
import { type Actor, upsertRow } from './writes';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  default_location_id: string | null;
  is_active: number;
};

export type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  permissions: Set<string>;
  /** Every role held, primary first. */
  roles: string[];
  can: (p: Permission) => boolean;
  /** Stamped onto every row this device writes. */
  actor: Actor;
  deviceId: string | null;
  /** The location this user bills from by default. */
  locationId: string | null;
  setLocationId: (id: string) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const system = useSystem();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationOverride, setLocationOverride] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // Track the Supabase session and connect sync when one exists.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (data.session) system.connect().catch((e) => console.error('[sync] connect', e));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) system.connect().catch((e) => console.error('[sync] connect', e));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [system]);

  const userId = session?.user.id ?? null;

  // Register (or touch) this device once we know who is using it.
  useEffect(() => {
    if (!userId || !deviceId) return;
    upsertRow(system.db, 'devices', deviceId, {
      user_id: userId,
      name: defaultDeviceName(),
      platform: devicePlatform(),
      last_seen_at: new Date().toISOString(),
      is_active: true,
    }).catch((e) => console.warn('[device] register', e));
  }, [userId, deviceId, system.db]);

  const { data: profiles } = useQuery<Profile>(
    'SELECT id, full_name, role, default_location_id, is_active FROM profiles WHERE id = ?',
    [userId ?? '']
  );
  const profile = profiles?.[0] ?? null;

  // A person can hold more than one role, so permissions are the union of all
  // of them. `profiles.role` is folded in alongside `profile_roles` for the
  // same reason the server does it: an older code path may have written only
  // the primary, and a staff member whose permissions briefly resolve to
  // nothing sees every screen empty and assumes the app is broken.
  const { data: permRows } = useQuery<{ permission: string }>(
    `SELECT DISTINCT rp.permission
       FROM role_permissions rp
      WHERE rp.role IN (
        SELECT role FROM profile_roles WHERE profile_id = ?1
        UNION
        SELECT role FROM profiles WHERE id = ?1
      )`,
    [userId ?? '']
  );

  /** Every role this person holds, primary first. For display. */
  const { data: roleRows } = useQuery<{ role: string }>(
    'SELECT role FROM profile_roles WHERE profile_id = ? ORDER BY role',
    [userId ?? '']
  );
  const roles = useMemo(() => {
    const set = new Set((roleRows ?? []).map((r) => r.role));
    if (profile?.role) set.add(profile.role);
    // Primary first, the rest alphabetical — the list is read, not sorted on.
    return [profile?.role, ...[...set].filter((r) => r !== profile?.role).sort()].filter(Boolean) as string[];
  }, [roleRows, profile?.role]);

  const permissions = useMemo(() => new Set((permRows ?? []).map((r) => r.permission)), [permRows]);

  // Every document — bill, purchase, job card, adjustment, audit — has a NOT
  // NULL location_id, so a session with no working location cannot create so
  // much as a draft: the insert is refused by the server, PowerSync reverts the
  // local row, and the screen sits on "Preparing draft…" for ever with nothing
  // to explain it. A profile with no default_location_id is ordinary — the
  // owner's own profile has none — so fall back to the shop's first location
  // rather than to null. The user can still switch it from More.
  const { data: locationRows } = useQuery<{ id: string }>(
    'SELECT id FROM locations WHERE is_active = 1 ORDER BY sort_order, name LIMIT 1');
  const firstLocationId = locationRows?.[0]?.id ?? null;

  const value = useMemo<SessionState>(
    () => ({
      loading,
      session,
      profile,
      permissions,
      roles,
      can: (p) => can(permissions, p),
      actor: { userId, deviceId },
      deviceId,
      locationId: locationOverride ?? profile?.default_location_id ?? firstLocationId,
      setLocationId: setLocationOverride,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? friendlyAuthError(error.message) : null;
      },
      async signOut() {
        await system.disconnect(false);
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile, permissions, roles, locationOverride, firstLocationId, system, userId, deviceId]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/network|fetch/i.test(message)) return 'Cannot reach the server. Check the connection and try again.';
  return message;
}
