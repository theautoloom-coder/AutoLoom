# Deploying AutoLoom to the VPS

The web app is a static bundle. It talks to Supabase and PowerSync directly
from the browser, so the server only ever serves files — no Node process, no
database on the VPS, nothing to keep running.

## The server this deploys to

`root@38.49.209.165` — Ubuntu 26.04, reached with the key at
`D:\Gulshan\Keys\ServoRica_TradeOS`.

**This box is shared.** It already runs seven other sites behind **Caddy**,
including a payment gateway, so:

- **Caddy is the web server, not nginx.** nginx is installed but stopped, and
  must stay stopped — starting it would fight Caddy for ports 80 and 443 and
  take every other site down with it.
- Caddy gets and renews its own Let's Encrypt certificates. There is no
  certbot step.
- AutoLoom only ever adds one hostname block and one directory. Nothing above
  its block in the Caddyfile is touched.

## One time

### 1. DNS

There is no wildcard record, so the subdomain needs its own. DNS for
`theautoloom.in` is at **BigRock**. The root domain is for the product
website; the app lives on a subdomain.

| Type | Name       | Value            | TTL      |
|------|------------|------------------|----------|
| A    | `app`      | `38.49.209.165`  | lowest   |

BigRock warns the record takes 4–6 hours to take effect. Check it landed
before going further — Caddy cannot get a certificate for a name that does
not resolve:

```bash
dig +short app.theautoloom.in      # must print 38.49.209.165
```

### 2. The Caddy block

```bash
# Back up first — this file is what keeps the other seven sites online.
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F-%H%M%S)
cat deploy/autoloom.caddy >> /etc/caddy/Caddyfile

# validate BEFORE reload: a refused reload leaves the running config alone,
# so a mistake here cannot take the other sites down.
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

The certificate is issued on the first request, within a few seconds.

## Every deploy, from this repo

```bash
SSH_KEY="/d/Gulshan/Keys/ServoRica_TradeOS" \
  ./deploy/build-and-deploy.sh app.theautoloom.in root@38.49.209.165
```

It builds against production, checks the PWA files are present, rsyncs into
`/var/www/autoloom`, validates the Caddy config and reloads. Takes a couple of
minutes, most of it the bundle.

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
commit and re-running the deploy script undoes it. To take the site off the
internet entirely, delete its block from the Caddyfile and reload — or restore
one of the `/etc/caddy/Caddyfile.bak-*` copies.
