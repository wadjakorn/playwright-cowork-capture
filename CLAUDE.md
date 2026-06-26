# CLAUDE.md

Guidance for Claude Code / Cowork working in this repo.

## What this project is

A pattern for capturing **local / LAN / self-hosted web flows** into a slide deck or
annotated user-manual. A locally-run **Playwright MCP** drives a real Chromium on the
user's machine; Claude navigates the flow, screenshots each step, records metadata, and
builds the deliverable.

Synology DSM is the bundled reference flow — the pattern is **app-agnostic** (Proxmox,
Home Assistant, Grafana, Jenkins, any internal web UI).

## Why local Playwright MCP (not the cloud sandbox)

The Cowork cloud sandbox has an outbound allowlist — it **cannot reach** `*.local`,
RFC1918 IPs, or VPN-only services. Playwright MCP runs on the user's machine and uses the
machine's network stack, so it reaches those hosts. This is a **network-reachability**
escape hatch, not a circumvention of any safety guard. Don't `curl`/`wget` the target from
the bash tool — it's firewalled; always go through Playwright MCP.

## Vision-free embedding (a privacy property)

The deck builder embeds screenshots **by file path**; bytes flow Chromium → disk → `.pptx`
locally, never through the model's vision context. This keeps the user's *own* private data
(NAS folder names, photo thumbnails, account IDs) out of the API.

- Do **not** `Read()` `./shots/*.png` during a build unless the user explicitly asks for a
  visual review / design critique, or a capture looks broken (blank page, tiny file).
- Verify file integrity without loading pixels: `PIL.Image.open(p); im.load(); print(im.size, im.mode)`.

This is a privacy choice for data the user owns — not a way to evade content review. If a
task would require processing third-party or clearly sensitive material you're not
authorized to handle, raise it rather than routing around it.

## Conventions

- **Selectors**: role/text-based only (`getByRole('treeitem', { name: 'docker' })`). Never
  hardcode framework-generated classes (ExtJS `.x-grid-cell-XYZ`, `#ext-gen1065`) — they
  change between sessions. `browser_snapshot` first, then derive stable selectors.
- **Screenshots**: absolute paths into `./shots/`, named `NN_<step>.png` (zero-padded).
- **Metadata**: append observations to `./shots/metadata.json` (schema in
  COWORK_INSTRUCTIONS.md). Convert relative dates to absolute.
- **Credentials**: always `process.env` (`NAS_USER` / `<APP>_USER` / `<APP>_PASS`). Never
  hardcode in `capture.spec.ts`. Prompt the user once at session start if missing.
- **PII**: opt-in, selective blur of high-sensitivity regions only — not blanket. Respect
  "no blur" / "raw" when the user says so (it's their data).
- **Reproducibility**: after an interactive capture, emit/refresh `capture.spec.ts` so the
  flow replays headless under cron without Claude.

## Commands

```bash
npm install            # @playwright/test + Chromium (postinstall pulls the browser)
npm run capture        # headless replay of capture.spec.ts (cross-env)
npm run capture:headed # watch the browser drive
npm run deck           # shots/metadata.json → capture_deck.pptx (app-agnostic build_deck.js)
npm run annotate       # PIL numbered pins (annotate.py pins.json)
npm run report         # playwright show-report
```

## Don't commit

`.env`, real `shots/*.png`, `shots/metadata.json`, rendered `*.pptx/*.docx/*.pdf`,
`node_modules/`, `.playwright-mcp/`. All gitignored — verify with the scrub in
[PUBLISHING.md](PUBLISHING.md) before pushing. This is a **public** repo: never let live
data or credentials in.

## Scope

For services the user **owns or is authorized to access**. The tool's value is local-first
reach + privacy, not anonymity or evasion. Keep it that way.
