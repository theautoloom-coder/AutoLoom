/**
 * Do the test route lists still match the app?
 *
 *   node test/routes.mjs
 *
 * The walk lists and the English scan carry hand-written paths. A path that no
 * longer exists renders a 404, which reports no missing text and no broken
 * widget — so both tests went green while /sell, /audits and /admin/families
 * had been deleted, and while /help had never been added. A green test that
 * checks a page nobody can reach is worse than no test.
 *
 * This compares the lists against the filesystem in both directions: every
 * listed path must resolve to a route, and every route must be listed
 * somewhere or named here as deliberately skipped.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP = 'src/app';

/** Every route file under src/app, as the URL it serves. */
function routes(dir = APP, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      routes(full, out);
      continue;
    }
    if (!name.endsWith('.tsx') || name.startsWith('_')) continue;
    const rel = relative(APP, full).split(sep).join('/').replace(/\.tsx$/, '');
    // A (group) is a layout device, not a path segment.
    const url = '/' + rel.split('/').filter((s) => !/^\(.+\)$/.test(s)).join('/');
    out.push(url.replace(/\/index$/, '') || '/');
  }
  return out;
}

const ALL = new Set(routes());

/** Screens a walk cannot reach without an id, or that only exist as targets. */
const SKIP = new Set(
  [...ALL].filter((r) => r.includes('[')).concat(['/sign-in', '/reset-password'])
);

function listed(file, re) {
  const src = readFileSync(file, 'utf8');
  const block = src.match(re);
  if (!block) throw new Error(`could not find the screen list in ${file}`);
  return [...block[0].matchAll(/'(\/[^']*)'/g)].map((m) => m[1].split('?')[0]);
}

const walk = listed('test/flow-walk.mjs', /const SCREENS = \[[\s\S]*?\n\];/);
const english = listed('test/english-left.mjs', /const SCREENS = \[[\s\S]*?\n\];/);

const problems = [];
for (const [name, paths] of [['flow-walk', walk], ['english-left', english]]) {
  for (const p of paths) {
    if (!ALL.has(p)) problems.push(`${name}: ${p} is listed but no screen serves it`);
  }
}

const covered = new Set([...walk, ...english]);
for (const r of ALL) {
  if (SKIP.has(r) || covered.has(r)) continue;
  problems.push(`no test opens ${r} — add it to a list, or to SKIP with a reason`);
}

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ ${ALL.size} routes, ${covered.size} covered, ${SKIP.size} skipped`);
