/**
 * Ship the app to every phone over the air — no new APK.
 *
 *   node scripts/ship-update.mjs "Kya badla, ek line mein"
 *
 * The APK (built once with expo-updates, runtimeVersion "1") asks EAS Update
 * for new versions on the "production" channel when it opens and when it comes
 * back to the front; see src/ui/app-updates.tsx. This publishes one.
 *
 * Three steps, each one refusing to go on if the last looks wrong:
 *
 *   1. Export the Android bundle against PRODUCTION. Metro inlines
 *      EXPO_PUBLIC_* at transform time; a .env pointing at the laptop's local
 *      Supabase must never reach the shop's phones, so the values are set here
 *      and the export runs with --clear.
 *   2. Prove it: the bundle must contain the production Supabase URL and must
 *      not contain 127.0.0.1:54321.
 *   3. Publish exactly that folder (--skip-bundler) to the production channel.
 *
 * Only JavaScript and assets travel this way. A native change — a new native
 * module, a permission, an Expo SDK upgrade — needs a new APK and a new
 * runtimeVersion in app.json, or old phones would load code their native
 * layer cannot run.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const message = process.argv.slice(2).join(' ').trim();
if (!message) { console.error('✗ likho kya badla: node scripts/ship-update.mjs "Kharab maal ka naya flow"'); process.exit(2); }

const appDir = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outDir = path.join(appDir, 'dist-update');

// eas-cli reads EXPO_TOKEN from the environment; it lives in app/.env (gitignored).
if (!process.env.EXPO_TOKEN) {
  try {
    const line = fs.readFileSync(path.join(appDir, '.env'), 'utf8').split('\n').find((l) => l.startsWith('EXPO_TOKEN='));
    if (line) process.env.EXPO_TOKEN = line.slice('EXPO_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
  } catch { /* exported by the caller, or missing — checked below */ }
}
if (!process.env.EXPO_TOKEN) { console.error('✗ no EXPO_TOKEN in app/.env'); process.exit(1); }

const PROD = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://nczuxjzkkboetekfhqle.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jenV4anpra2JvZXRla2ZocWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzgzNzUsImV4cCI6MjEwNTA1NDM3NX0.3-L5sJWmbx6NePoIDIj_dxEK3LHEKgcU8DgBrHeOsoQ',
  EXPO_PUBLIC_POWERSYNC_URL: 'https://6aa94f588453e7cf8337416e.powersync.journeyapps.com',
};
const env = { ...process.env, ...PROD, NODE_ENV: 'production' };
const run = (cmd) => execSync(cmd, { cwd: appDir, env, stdio: 'inherit' });

console.log('▸ export (android, production backend)');
fs.rmSync(outDir, { recursive: true, force: true });
run(`npx expo export --platform android --output-dir dist-update --clear`);

console.log('▸ check the bundle');
const bundles = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name);
  if (f.isDirectory()) walk(p); else if (/\.(hbc|js)$/.test(f.name)) bundles.push(p);
} };
walk(path.join(outDir, '_expo'));
if (!bundles.length) { console.error('✗ no bundle in dist-update'); process.exit(1); }
const all = Buffer.concat(bundles.map((b) => fs.readFileSync(b)));
if (!all.includes(Buffer.from(PROD.EXPO_PUBLIC_SUPABASE_URL))) { console.error('✗ bundle does not contain the production Supabase URL'); process.exit(1); }
if (all.includes(Buffer.from('127.0.0.1:54321'))) { console.error('✗ bundle points at the local Supabase'); process.exit(1); }
console.log(`  ok — ${bundles.length} bundle(s), production backend`);

console.log('▸ publish to channel "production"');
const msg = message.replace(/"/g, "'");
run(`npx --yes eas-cli@latest update --channel production --environment production --platform android --skip-bundler --input-dir dist-update --message "${msg}" --non-interactive`);
console.log('✓ published — phones pick it up the next time the app opens or comes to the front');
