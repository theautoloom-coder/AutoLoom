/**
 * Create a staff login from inside the app.
 *
 * Until now adding a salesman meant opening the Supabase dashboard by hand,
 * because creating an auth user needs the service_role key and that key can
 * never ship in a client. This function is the server side of that: it holds
 * the key, and it will only act for a caller who is already an admin or owner
 * in this shop's own profiles table.
 *
 * It creates the auth user pre-confirmed (there is no inbox for a counter
 * phone to check) and the matching profiles row in the same call, so a staff
 * member can never exist as a login with no role, or a role with no login.
 *
 * Deploy:  supabase functions deploy create-staff --project-ref <ref>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ROLES = ['admin', 'owner', 'purchase', 'sales', 'warehouse', 'accounts', 'workshop'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Who is asking? The caller's own JWT, never a claim in the body.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Sign in karke dobara try karo.' }, 401);

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: 'Session purana ho gaya. Dobara sign in karo.' }, 401);

  // 2. Are they allowed to? Read the role server-side; a client cannot fake it.
  const { data: me } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', caller.user.id)
    .single();

  if (!me?.is_active || !['admin', 'owner'].includes(me.role)) {
    return json({ error: 'Sirf admin ya owner staff add kar sakta hai.' }, 403);
  }

  // 3. Validate the request.
  let body: { email?: string; password?: string; full_name?: string; role?: string; mobile?: string; default_location_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request theek nahi hai.' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const fullName = body.full_name?.trim();
  const role = body.role ?? 'sales';

  if (!email || !email.includes('@')) return json({ error: 'Email theek nahi hai.' }, 400);
  if (password.length < 8) return json({ error: 'Password kam se kam 8 character ka rakho.' }, 400);
  if (!fullName) return json({ error: 'Naam likho.' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'Role theek nahi hai.' }, 400);

  // 4. Create the login, pre-confirmed — nobody checks mail on a shop counter.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created?.user) {
    const already = /already|exists|registered/i.test(createErr?.message ?? '');
    return json({ error: already ? 'Ye email pehle se hai.' : (createErr?.message ?? 'Login nahi bana.') }, 400);
  }

  // 5. The profile carries the role. If this fails the login is useless, so
  //    remove it again rather than leave a half-made staff member behind.
  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: fullName,
    mobile: body.mobile?.trim() || null,
    role,
    default_location_id: body.default_location_id ?? null,
    is_active: true,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return json({ error: `Profile nahi bana: ${profileErr.message}` }, 400);
  }

  await admin.from('audit_logs').insert({
    user_id: caller.user.id,
    table_name: 'profiles',
    row_id: created.user.id,
    action: 'create_staff',
    new_data: { email, role, full_name: fullName },
    reason: 'Admin ne app se staff banaya',
  });

  return json({ id: created.user.id, email, role });
});
