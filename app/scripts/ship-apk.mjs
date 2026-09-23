/**
 * Wait for an EAS Android build, then put the APK on the server.
 *
 *   EXPO_TOKEN=... SSH_KEY=... node scripts/ship-apk.mjs [buildId]
 *
 * With no id it takes the most recent Android build.
 *
 * The APK is fetched **by the VPS**, not through this machine: the server sits
 * on a fast link and a laptop on shop wifi does not, so pulling 40 MB down and
 * pushing it back up is the slowest possible route. The artifact URL is public
 * and unguessable, so curl on the far end is all it takes.
 *
 * It writes to a temporary name and renames only after the size and the ZIP
 * magic check out, so a half-downloaded file can never be served as an APK —
 * a partial install is a much worse failure than a missing download.
 */
import { execFileSync, execSync } from 'node:child_process';

const SSH_KEY = process.env.SSH_KEY ?? '/d/Gulshan/Keys/ServoRica_TradeOS';
const HOST = process.env.APK_HOST ?? 'root@38.49.209.165';
const DEST = '/var/www/autoloom-download/autoloom.apk';
const buildId = process.argv[2];

// execSync, not execFileSync: on Windows `npx` is a .cmd shim and cannot be
// spawned directly — it fails with pid 0 and no output at all, which looks like
// a build error rather than a launch error.
const eas = (args) =>
  execSync(`npx --yes eas-cli@latest ${args.join(' ')}`, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

const ssh = (cmd) =>
  execFileSync('ssh', ['-i', SSH_KEY, '-o', 'ConnectTimeout=30', HOST, cmd], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });

/**
 * Always via build:list — `build:view --json` returns nothing usable on this
 * CLI version, so the newest Android build is read from the list and matched by
 * id when one was given.
 */
function currentBuild() {
  const list = JSON.parse(eas(['build:list', '--platform', 'android', '--limit', '5', '--json', '--non-interactive']));
  if (!Array.isArray(list) || list.length === 0) return null;
  return buildId ? (list.find((b) => b.id === buildId) ?? null) : list[0];
}

console.log('▸ waiting for the build');
let build;
for (let i = 0; i < 90; i++) {
  build = currentBuild();
  const status = build?.status ?? 'UNKNOWN';
  if (status === 'FINISHED') break;
  if (['ERRORED', 'CANCELED'].includes(status)) {
    console.error(`✗ build ${status.toLowerCase()} — ${build?.error?.message ?? 'see the EAS logs'}`);
    process.exit(1);
  }
  process.stdout.write(`  ${status}… (${i * 30}s)\r`);
  await new Promise((r) => setTimeout(r, 30000));
}

const url = build?.artifacts?.buildUrl ?? build?.artifacts?.applicationArchiveUrl;
if (!url) { console.error('✗ finished, but no artifact URL'); process.exit(1); }
console.log(`\n▸ artifact ${url}`);

console.log('▸ server is downloading it');
const out = ssh(
  `set -e
   cd /var/www/autoloom-download
   curl -fSL --retry 3 --retry-delay 5 -o autoloom.apk.part "${url}"
   size=$(stat -c%s autoloom.apk.part)
   # An APK is a ZIP: the first two bytes are PK. Anything else is an error page.
   magic=$(head -c2 autoloom.apk.part)
   if [ "$magic" != "PK" ] || [ "$size" -lt 1000000 ]; then
     rm -f autoloom.apk.part; echo "BAD: $size bytes, magic '$magic'"; exit 1
   fi
   mv autoloom.apk.part ${DEST}
   chown caddy:caddy ${DEST}
   echo "OK $(numfmt --to=iec $size)"`,
);
console.log(`  ${out.trim()}`);

const head = ssh(`curl -sS -o /dev/null -m 30 -w "%{http_code} %{size_download}" --resolve app.theautoloom.in:443:127.0.0.1 https://app.theautoloom.in/download/autoloom.apk`);
console.log(`▸ served: HTTP ${head.trim()}`);
console.log('✓ https://app.theautoloom.in/install');
