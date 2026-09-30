/**
 * Build the web bundle for LOCAL testing, and prove it is actually local.
 *
 *   node scripts/build-local.mjs [outDir]
 *
 * This exists because of a trap that is very easy to fall into and very hard
 * to notice. Metro inlines EXPO_PUBLIC_* at transform time and caches the
 * result per module. src/lib/supabase.ts almost never changes, so an export
 * run without --clear happily reuses whatever backend was compiled into it
 * last time. Deploy to production once, then build "locally" without --clear,
 * and you get a bundle that looks local, serves from your own machine, and
 * talks to the real shop's database.
 *
 * That happened. The only reason nothing was written to production is that the
 * seeded local login does not exist there, so sign-in failed — a lucky stop,
 * not a designed one. deploy/build-and-deploy.sh has had the mirror-image
 * check since the same bug bit the other way; this is the missing half.
 *
 * So: always --clear, then read the bundle back and refuse to hand over a
 * "local" build that names the production project.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? 'dist-local';

/** The one string that must not appear in a local bundle. */
const PRODUCTION_REF = 'nczuxjzkkboetekfhqle';

const env = fs.readFileSync(path.join(appDir, '.env'), 'utf8');
const localUrl = (env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m) ?? [])[1]?.trim();
if (!localUrl) {
  console.error('✗ .env has no EXPO_PUBLIC_SUPABASE_URL');
  process.exit(1);
}
if (localUrl.includes(PRODUCTION_REF)) {
  console.error(`✗ .env points at production (${localUrl}). This script only builds local.`);
  process.exit(1);
}

console.log(`▸ building ${outDir} against ${localUrl}`);
execSync(`npx expo export --platform web --clear --output-dir ${outDir}`, {
  cwd: appDir,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const webDir = path.join(appDir, outDir, '_expo/static/js/web');
const entry = fs.readdirSync(webDir).find((f) => f.startsWith('entry-') && f.endsWith('.js'));
if (!entry) {
  console.error('✗ no entry bundle in the export');
  process.exit(1);
}
const js = fs.readFileSync(path.join(webDir, entry), 'utf8');

const host = localUrl.replace(/^https?:\/\//, '');
if (!js.includes(host)) {
  console.error(`✗ the bundle does not mention ${host} — it was not built against .env`);
  process.exit(1);
}
if (js.includes(PRODUCTION_REF)) {
  console.error('✗ the bundle names the PRODUCTION Supabase project. Refusing to serve it as local.');
  console.error('  This is the stale Metro transform cache. Delete .expo and node_modules/.cache and retry.');
  process.exit(1);
}

console.log(`✓ ${outDir} → ${localUrl}  (${entry})`);
