# Synology DSM — Root Directory Capture (Playwright)

Deterministic Playwright spec that signs into a Synology DSM, opens File Station, enumerates the root shared folders, and saves PII-blurred screenshots + a JSON manifest.

## Run

```bash
npm install            # installs @playwright/test and pulls Chromium
cp .env.example .env   # then fill NAS_PASS
NAS_USER=wadjakorn NAS_PASS='…' npm run capture
```

Artifacts land in `./shots/`:

```
shots/
  01_signin_landing.png   (or 01_signin_form.png if NOT pre-authenticated)
  02_desktop.png
  03_docker.png
  04_home.png
  05_homes.png
  06_photo.png
  metadata.json
```

## Cron

```cron
# every morning at 08:00
0 8 * * *  cd /opt/synology-capture && NAS_USER=wadjakorn NAS_PASS=… /usr/bin/npx playwright test capture.spec.ts >> /var/log/syno-capture.log 2>&1
```

## PII handling

Per the project mandate (*"automated screen capture by skip PII"*), before each
screenshot the spec injects a stylesheet that blurs:

- file/folder name labels (`.syno-finder-icon-text`)
- photo thumbnails (`[class*="finder-icon"] img[src*="thumb"]`)
- tree-node usernames (`.x-tree-node-anchor span`)
- the top-right account badge (`[class*="header-username"]`)
- anything tagged `data-pii="true"`

Add custom selectors in `PII_SELECTORS` at the top of `capture.spec.ts`.

## Why not headless from CI directly to the NAS?

- LAN-only `dbaze-nas:5001` — only reachable from the same broadcast domain or via QuickConnect relay.
- The QuickConnect URL (`https://<id>.quickconnect.to`) redirects to a self-signed cert on a relay subdomain — `ignoreHTTPSErrors: true` is already set in `playwright.config.ts`.
- The first signin sets a session cookie; subsequent runs may skip the form (spec handles both branches).

## Observed root layout (2026-06-22)

| folder  | items | purpose                                            |
| :------ | ----: | :------------------------------------------------- |
| docker  |     4 | Container volumes (immich, streaming, vaultwarden) |
| home    |    12 | Personal home of signed-in user                    |
| homes   |     6 | Admin view — all users' home directories           |
| photo   |    27 | Synology Photos library                            |

Volume: `@volume1`, 2.92 TB used of 3.48 TB.
