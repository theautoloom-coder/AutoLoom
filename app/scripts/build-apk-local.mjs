/**
 * Build the production APK on this machine.
 *
 *   node scripts/build-apk-local.mjs [--prebuild]
 *
 * EAS works, but its free queue has run to three quarters of an hour, and the
 * whole Android toolchain is already installed here. This does the same job in
 * about ten minutes and needs nothing but the SDK and the signing key.
 *
 * Three things it will not let you get wrong:
 *
 * 1. THE BUNDLE'S BACKEND. Metro inlines EXPO_PUBLIC_* at transform time, and
 *    app/.env points at the LOCAL Supabase. Left alone, `assembleRelease` would
 *    happily ship an APK that talks to 127.0.0.1 and is dead on every phone. So
 *    the production values are exported here and the finished APK is read back
 *    to prove they are the ones inside it.
 *
 * 2. THE SIGNATURE. `expo prebuild` writes a release signingConfig that points
 *    at the DEBUG keystore, with a comment telling you to fix it. An APK signed
 *    with the debug key cannot be updated over one signed with the real key, so
 *    this patches the config to deploy/keys and fails if the key is missing.
 *
 * 3. THE VERSION CODE. Two APKs with the same versionCode are the same version
 *    as far as a phone is concerned, and OxygenOS answers a same-version
 *    sideload with "App not installed". This bumps it every build.
 *
 * android/ is generated and gitignored; prebuild regenerates it and wipes the
 * signing patch, which is why the patch lives here and is re-applied each run.
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(appDir, 'android');
const keysDir = path.resolve(appDir, '../deploy/keys');
const keystore = path.join(keysDir, 'autoloom-release.keystore');
const keyInfo = path.join(keysDir, 'autoloom-keystore.txt');

const PROD = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://nczuxjzkkboetekfhqle.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jenV4anpra2JvZXRla2ZocWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzgzNzUsImV4cCI6MjEwNTA1NDM3NX0.3-L5sJWmbx6NePoIDIj_dxEK3LHEKgcU8DgBrHeOsoQ',
  EXPO_PUBLIC_POWERSYNC_URL: 'https://6aa94f588453e7cf8337416e.powersync.journeyapps.com',
};

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!fs.existsSync(keystore)) die(`no signing key at ${keystore}`);
const pw = (fs.readFileSync(keyInfo, 'utf8').match(/^password\s*:\s*(\S+)/m) ?? [])[1];
if (!pw) die(`no password line in ${keyInfo}`);

// ---------------------------------------------------------------------------
// versionCode: kept here rather than in app.json, because app.json's
// appVersionSource is "remote" and EAS owns that number. Local builds need
// their own counter, and it must only ever go up.
// ---------------------------------------------------------------------------
const counterFile = path.join(keysDir, 'versionCode.txt');
const versionCode = (fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, 'utf8').trim()) : 2) + 1;
fs.writeFileSync(counterFile, String(versionCode), 'utf8');

const env = { ...process.env, ...PROD };

if (process.argv.includes('--prebuild') || !fs.existsSync(androidDir)) {
  console.log('▸ prebuild');
  execSync('npx expo prebuild --platform android --clean', { cwd: appDir, env, stdio: ['ignore', 'ignore', 'inherit'] });
}

// ---- signing + version, patched into the generated project ----
const gradlePath = path.join(androidDir, 'app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');

const relStore = path.relative(path.join(androidDir, 'app'), keystore).replace(/\\/g, '/');
if (!gradle.includes('autoloomRelease')) {
  gradle = gradle.replace(
    /signingConfigs \{\n(\s+)debug \{/,
    (m, indent) =>
      `signingConfigs {\n${indent}autoloomRelease {\n` +
      `${indent}    storeFile file('${relStore}')\n` +
      `${indent}    storePassword System.getenv('AUTOLOOM_KEYSTORE_PASSWORD')\n` +
      `${indent}    keyAlias 'autoloom'\n` +
      `${indent}    keyPassword System.getenv('AUTOLOOM_KEYSTORE_PASSWORD')\n` +
      `${indent}}\n${indent}debug {`
  );
  gradle = gradle.replace(
    /release \{\n(\s+)\/\/ Caution![\s\S]*?signingConfig signingConfigs\.debug/,
    (m, indent) => `release {\n${indent}signingConfig signingConfigs.autoloomRelease`
  );
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log('▸ signing config patched');
}
if (!gradle.includes('signingConfigs.autoloomRelease')) die('could not point release at the real keystore');

const appBuild = fs.readFileSync(gradlePath, 'utf8');
fs.writeFileSync(
  gradlePath,
  appBuild.replace(/versionCode \d+/, `versionCode ${versionCode}`),
  'utf8'
);
console.log(`▸ versionCode ${versionCode}`);

// ---- build ----
console.log('▸ gradle assembleRelease (arm64-v8a)');
// Absolute path: launched from Git Bash, cmd did not resolve a bare
// gradlew.bat against the cwd and reported it as a missing command, which
// reads like a broken toolchain rather than a quoting problem.
execFileSync(path.join(androidDir, 'gradlew.bat'), ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--no-daemon'], {
  cwd: androidDir,
  env: { ...env, AUTOLOOM_KEYSTORE_PASSWORD: pw },
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
});

const apk = path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(apk)) die('gradle finished but produced no APK');

// ---- prove it is the APK we meant to build ----
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const tools = path.join(sdk, 'build-tools/36.0.0');
const run = (exe, args) => execFileSync(path.join(tools, exe), args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const badging = run('aapt2.exe', ['dump', 'badging', apk]);
const verify = execFileSync('cmd', ['/c', path.join(tools, 'apksigner.bat'), 'verify', '--print-certs', apk], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});

const bytes = fs.readFileSync(apk);
if (!bytes.includes(Buffer.from(PROD.EXPO_PUBLIC_SUPABASE_URL))) die('the APK does not contain the production Supabase URL');
if (bytes.includes(Buffer.from('127.0.0.1:54321'))) die('the APK still points at the local Supabase');

const line = (re) => (badging.match(re) ?? [])[1] ?? '?';
console.log('');
console.log(`✓ ${apk}`);
console.log(`  package     ${line(/name='([^']+)'/)}`);
console.log(`  version     ${line(/versionName='([^']+)'/)} (code ${line(/versionCode='([^']+)'/)})`);
console.log(`  native      ${line(/native-code: '([^']+)'/)}`);
console.log(`  size        ${(bytes.length / 1048576).toFixed(1)} MB`);
console.log(`  signature   ${(verify.match(/SHA-256 digest: (\w+)/) ?? [])[1] ?? '?'}`);
console.log(`  backend     ${PROD.EXPO_PUBLIC_SUPABASE_URL}`);
