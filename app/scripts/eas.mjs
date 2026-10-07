/**
 * Run any eas-cli command with the project's Expo token from app/.env.
 *
 *   node scripts/eas.mjs channel:list
 *   node scripts/eas.mjs update:list --branch production
 *
 * eas-cli reads EXPO_TOKEN from the environment and npm does not load .env,
 * so a bare `npx eas …` answers "An Expo user account is required".
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const appDir = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (!process.env.EXPO_TOKEN) {
  try {
    const line = fs.readFileSync(path.join(appDir, '.env'), 'utf8').split('\n').find((l) => l.startsWith('EXPO_TOKEN='));
    if (line) process.env.EXPO_TOKEN = line.slice('EXPO_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
  } catch { /* checked below */ }
}
if (!process.env.EXPO_TOKEN) { console.error('✗ no EXPO_TOKEN in app/.env'); process.exit(1); }
const args = process.argv.slice(2).map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, "'")}"` : a)).join(' ');
execSync(`npx --yes eas-cli@latest ${args} --non-interactive`, { cwd: appDir, stdio: 'inherit' });
