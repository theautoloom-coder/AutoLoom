/**
 * Creating a staff login, and getting one back when the password is lost.
 *
 * The client cannot do this itself: creating an auth user needs the
 * service_role key, and that key must never leave the server. So the app
 * calls the `create-staff` Edge Function with the signed-in user's own JWT,
 * and the function decides — server-side — whether that person is an admin
 * or owner before it does anything.
 *
 * Returns null on success, or a message to show the user.
 */
import { supabase, SUPABASE_URL } from './supabase';

export type NewStaff = {
  full_name: string;
  email: string;
  password: string;
  mobile?: string;
  role: string;
  default_location_id?: string | null;
};

export async function createStaff(input: NewStaff): Promise<string | null> {
  if (!input.full_name.trim()) return 'Naam likho.';
  if (!input.email.includes('@')) return 'Email theek nahi hai.';
  if (input.password.length < 8) return 'Password kam se kam 8 character ka rakho.';

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'Session purana ho gaya. Dobara sign in karo.';

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      // A 404 means the function was never deployed — say that plainly
      // instead of showing the raw platform error.
      if (res.status === 404) return 'Staff function server par deploy nahi hai. Ek baar deploy karna padega.';
      return body.error ?? `Nahi bana (${res.status}).`;
    }
    return null;
  } catch {
    return 'Server se baat nahi ho paayi. Internet check karo.';
  }
}


/**
 * Set someone else's password. Admin or owner only — enforced on the server.
 *
 * Staff emails here are invented by the owner and have no inbox, so a reset
 * link would go nowhere. The owner types a new password and tells them.
 */
export async function resetStaffPassword(userId: string, password: string): Promise<string | null> {
  if (password.length < 8) return 'Password kam se kam 8 character ka rakho.';

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'Session purana ho gaya. Dobara sign in karo.';

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, password }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      if (res.status === 404) return 'Reset function server par deploy nahi hai. Ek baar deploy karna padega.';
      return body.error ?? `Nahi badla (${res.status}).`;
    }
    return null;
  } catch {
    return 'Server se baat nahi ho paayi. Internet check karo.';
  }
}

/**
 * Change your own password. No server help needed: Supabase lets a signed-in
 * user set their own, so this works even if the Edge Function is not deployed.
 */
export async function changeMyPassword(password: string): Promise<string | null> {
  if (password.length < 8) return 'Password kam se kam 8 character ka rakho.';
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return null;
  if (/should be different|same as the old/i.test(error.message)) return 'Naya password purane se alag rakho.';
  return error.message || 'Password nahi badla.';
}

/**
 * Send a reset link. Only useful for an address someone can actually open —
 * in this shop that is the owner's own email, which is exactly the account
 * nobody else can rescue.
 */
export async function sendResetLink(email: string, redirectTo: string): Promise<string | null> {
  if (!email.includes('@')) return 'Email theek nahi hai.';
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  return error ? (error.message || 'Link nahi bheja ja saka.') : null;
}
