# Deploying AutoLoom

The web app is a static bundle. It talks to Supabase and PowerSync directly
from the browser, so the server only ever serves files — no Node process, no
database on the server, nothing to keep running.

## The server this deploys to

The **Oracle Cloud Mumbai** server, `theautoloom@137.23.39.214`, reached with
the key `C:\Users\91971\.ssh\theautoloom_oracle` (moved there from the old
VPS, 38.49.209.165, on 6 Oct 2026). It also runs the store
(theautoloom.in), which owns the setup:

- Everything AutoLoom serves lives in `/opt/theautoloom/www`: `autoloom/`
  (the app), `autoloom-download/` (the APK), `autoloom-install/` (the install
  page), `autoloom-manual/` (the PDF manual).
- **Caddy** serves `app.theautoloom.in` from the site file
  `/etc/caddy/sites/theautoloom.caddy`. Its source of truth is
  `deploy/oracle/theautoloom.caddy` in the **store** repo
  (TheAutoLoomStore); `deploy/autoloom.caddy` here is only the old VPS copy.
- **DNS is at Cloudflare**, proxied (orange cloud): `app` is an A record to
  137.23.39.214. The server only accepts Cloudflare's IPs, and presents a
  Cloudflare Origin CA certificate (`/opt/theautoloom/tls`).
- The box is shared with other apps: never touch anything outside
  `/opt/theautoloom`.

## Every deploy: push to main

The server checks GitHub every 2 minutes. When `main` has moved, it builds the
bundle on the server (the `appbuild` container, running this repo's
`deploy/build-and-deploy.sh` with the `local` target) and swaps it in. A failed
build changes nothing — the previous bundle keeps serving. Status and logs:

```bash
ssh -i ~/.ssh/theautoloom_oracle theautoloom@137.23.39.214 tail /opt/theautoloom/deploy/autodeploy.log
```

The first push after the switch-over is what starts it: until then the server
leaves the live bundle alone.

## Deploying by hand (a build that is not pushed yet)

```bash
./deploy/build-and-deploy.sh
```

It builds against production here, checks the PWA files are present, uploads
into `/opt/theautoloom/www/autoloom` and swaps it in. Takes a couple of
minutes, most of it the bundle. No Caddy reload is needed.

The APK: `node scripts/ship-apk.mjs` (from `app/`) has the server fetch the
finished EAS build into `/opt/theautoloom/www/autoloom-download`.

## The phones: over the air, no new APK

A push to `main` updates the web app only. The installed APK (v21 onwards)
takes its screens and logic from EAS Update, so after an app change also run,
from `app/`:

```bash
node scripts/ship-update.mjs "Kya badla, ek line mein"
```

It exports the Android bundle against production, refuses a bundle that does
not point at the production Supabase, and publishes it to the `production`
channel. Each phone picks it up the next time the app opens or comes back to
the front ("Naya version aa gaya — Abhi lagao"), or on its next launch.
`node scripts/eas.mjs update:list --branch production` shows what is live.

A new APK is needed only when the native layer changes — a new native module,
a permission, an Expo SDK upgrade. Then raise `runtimeVersion` in `app.json`
(so older APKs are not sent code they cannot run) and build with
`node scripts/build-apk-local.mjs --prebuild`, since the update settings are
native configuration.

## On the iPhone

Open `https://app.theautoloom.in` in **Safari** (not Chrome — only Safari
can install a PWA on iOS), then Share → **Add to Home Screen**. It opens
full-screen with the AutoLoom icon and works with no signal after the first
load.

## What this does not give you on iOS

- **No 6:30pm reminder.** That is a native notification; an installed PWA on
  iOS would need web push and a push service, which is not built.
- **No camera barcode scan.** Native-only in this app. Staff type or search,
  or use a Bluetooth scanner that types into the search box.
- **Storage can be evicted** under heavy storage pressure. Synced data comes
  back from the server on next load; local writes that had not synced yet
  would not. Keep the phone synced and this is a non-issue.

## Staff logins

The `create-staff` Edge Function is **deployed** (22 Sep 2026) and Admin →
Staff → "Naya staff" works. Redeploy it after any change to
`supabase/functions/create-staff/index.ts`:

```bash
SUPABASE_ACCESS_TOKEN="sbp_fc..." npx supabase functions deploy create-staff --project-ref nczuxjzkkboetekfhqle
```

The token is a *scoped* personal access token from
https://supabase.com/dashboard/account/tokens — scope it to this one project
and grant only **Edge Functions: Write** and **Project Settings: Read**. Never
a classic/full-access token, and revoke it once the deploy is done.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them yourself, and do not put the service_role key anywhere in this
repo.

**Two layers guard this function, and both matter.** The platform runs it with
`verify_jwt = true`, but that only proves the caller holds *some* valid JWT for
this project — and the anon key is one, sitting in every browser that loads the
app. So the function does its own check: it resolves the caller from their JWT
with the service_role client and reads `profiles.role` server-side, refusing
anyone who is not an active admin or owner. Verified against the live
deployment: no auth header → 401, malformed JWT → 401, and the **public anon
key → 401**, all before any user is created. If that server-side role check is
ever removed, the public anon key becomes enough to create an admin login.

## Rolling back

The deploy only replaces files in one directory, so checking out the previous
commit and re-running the deploy script undoes it. Faster, the build it
replaced is still on the server:

```bash
ssh -i ~/.ssh/theautoloom_oracle theautoloom@137.23.39.214 \
  'cd /opt/theautoloom/www && mv autoloom autoloom.bad && mv autoloom.old autoloom'
```

To take the site off the internet entirely, remove the `app.theautoloom.in`
block from `deploy/oracle/theautoloom.caddy` in the store repo and deploy that.
