/**
 * Creating a staff login from the app.
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
