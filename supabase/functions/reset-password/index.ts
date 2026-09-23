/**
 * Set a staff member's password, from inside the app.
 *
 * The counter hand forgets his password on a Tuesday morning. His email is
 * `salesman@theautoloom.in` — an address the owner invented, with no inbox
 * behind it — so a reset link has nowhere to go. Without this the only way
 * back in was the Supabase dashboard, which is to say: a phone call to whoever
 * set the shop up. That is not a system a shop can run on.
 *
 * So the owner types a new password and tells him. Same shape as create-staff:
 * the service_role key lives here, never in the client, and the caller's own
 * JWT decides whether they may do this.
 *
 * Deploy:  supabase functions deploy reset-password --project-ref <ref>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Every role a person holds — the primary one and any extra. */
async function rolesOf(admin: ReturnType<typeof createClient>, id: string): Promise<string[]> {
  const [{ data: profile }, { data: extra }] = await Promise.all([
    admin.from('profiles').select('role, is_active').eq('id', id).single(),
    admin.from('profile_roles').select('role').eq('profile_id', id),
  ]);
  if (!profile) return [];
  const set = new Set<string>([(profile as { role: string }).role]);
  for (const r of (extra ?? []) as { role: string }[]) set.add(r.role);
  return (profile as { is_active: boolean }).is_active ? [...set] : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Sign in karke dobara try karo.' }, 401);

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: 'Session purana ho gaya. Dobara sign in karo.' }, 401);

  // Read the roles server-side. A person can hold more than one, so this looks
  // at the whole set — checking only profiles.role would refuse an owner whose
  // primary role happens to be something else.
  const mine = await rolesOf(admin, caller.user.id);
  if (!mine.some((r) => r === 'admin' || r === 'owner')) {
    return json({ error: 'Sirf admin ya owner password badal sakta hai.' }, 403);
  }

  let body: { user_id?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request theek nahi hai.' }, 400);
  }

  const userId = body.user_id?.trim();
  const password = body.password ?? '';
  if (!userId) return json({ error: 'Kiska password badalna hai?' }, 400);
  if (password.length < 8) return json({ error: 'Password kam se kam 8 character ka rakho.' }, 400);

  // An admin must not be able to take the shop from its owner by resetting the
  // owner's password and signing in as them. Only an owner may do that.
  const theirs = await rolesOf(admin, userId);
  if (theirs.length === 0) return json({ error: 'Ye staff nahi mila.' }, 404);
  if (theirs.includes('owner') && !mine.includes('owner') && userId !== caller.user.id) {
    return json({ error: 'Owner ka password sirf owner khud badal sakta hai.' }, 403);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (updErr) return json({ error: updErr.message ?? 'Password nahi badla.' }, 400);

  // Who reset whose password, and when. The new password is never logged.
  await admin.from('audit_logs').insert({
    user_id: caller.user.id,
    table_name: 'profiles',
    row_id: userId,
    action: 'reset_password',
    new_data: { reset_for: userId },
    reason: 'Admin ne app se password reset kiya',
  });

  return json({ ok: true });
});
