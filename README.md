# playwright-cowork-capture

Capture **local / LAN / self-hosted web flows** into a slide deck or annotated user-manual, end-to-end — driven from Cowork by a locally-run Playwright MCP. macOS · Windows · Linux.

The cloud sandbox can't reach `*.local`, RFC1918 IPs, or VPN-only services. Playwright MCP runs a real Chromium **on your machine**, so it reaches them. You prompt once (*"capture flow X from `<URL>` and put it in a deck"*); Claude drives navigation → screenshots → metadata → deck.

Synology DSM is the bundled reference flow — the same pattern works for Proxmox, Home Assistant, Grafana, Jenkins, internal admin pages, or any web UI.

## Two ways to run

| Mode | When | Entry point |
|---|---|---|
| **Cowork + Playwright MCP** (primary) | Interactive — "capture X, build a deck" | Prompt Claude; see [COWORK_INSTRUCTIONS.md](COWORK_INSTRUCTIONS.md) |
| **Headless spec** (replay) | Cron / CI — no model in the loop | `npm run capture` → [capture.spec.ts](capture.spec.ts) |

## Quick start (headless replay)

```bash
npm install                  # @playwright/test + Chromium + pptxgenjs
cp .env.example .env         # fill in target URL + credentials
npm run capture              # cross-env → works on bash / zsh / cmd / PowerShell
npm run deck                 # shots/metadata.json → capture_deck.pptx
```

`capture` writes PNGs + `metadata.json` into `./shots/`; `deck` turns them into a slide deck. The two halves share one metadata schema, so the pipeline runs end-to-end with no hand-editing — `build_deck.js` is app-agnostic (it reads `target.product` for labels and tolerates missing fields). The bundled spec targets Synology DSM; adapt the URL + selectors for your own app — see [SETUP.md](SETUP.md).

Optional: `APP_NAME="Grafana" npm run capture` stamps the product name onto the deck; `npm run annotate` overlays numbered pins (see [pins.example.json](pins.example.json)).

## Design properties

- **Local-first** — screenshots are written by your local Chromium straight to a mounted folder. Nothing routes through the cloud sandbox, which can't reach LAN hosts anyway.
- **Privacy-preserving (vision-free embedding)** — the deck builder embeds PNGs **by file path**; the bytes go Chromium → disk → `.pptx` without ever entering the model's vision context. Your private screenshots stay out of the API unless you explicitly ask for a visual review. This is a privacy choice for *your own* data, not a way around any safety check.
- **Selective PII handling** — opt-in blur of high-sensitivity regions (photo thumbnails, faces, file contents), not blanket blur. See the policy in [COWORK_INSTRUCTIONS.md](COWORK_INSTRUCTIONS.md).
- **Reproducible** — every capture session also emits a deterministic `capture.spec.ts` so you can replay it under cron without Claude.
- **Cross-platform** — MCPB bundle declares `darwin / linux / win32`; scripts route env vars through `cross-env`; `annotate.py` falls back across macOS → Linux → Windows fonts. The bundle in [`mcpb/`](mcpb/) is hardened for Claude Desktop's built-in-Node runtime (pinned/vendored, no runtime `npx`; manual stdio bridge) so it doesn't crash-loop on Windows — see [SETUP.md](SETUP.md) Step 1.

## Repo layout

| File | Role |
|---|---|
| [capture.spec.ts](capture.spec.ts) | Deterministic Playwright flow (reference: Synology DSM) |
| [playwright.config.ts](playwright.config.ts) | viewport, retries, HTTPS, timeouts |
| [annotate.py](annotate.py) | PIL post-processor — numbered pins on screenshots |
| [build_deck.js](build_deck.js) | pptxgenjs deck builder |
| [COWORK_INSTRUCTIONS.md](COWORK_INSTRUCTIONS.md) | Paste into the Cowork project Instructions field |
| [mcpb/](mcpb/) | Hardened Playwright MCP extension source (pinned, vendored launcher) — see [mcpb/README.md](mcpb/README.md) |
| [scripts/](scripts/) | `build-mcpb.ps1` (build the `.mcpb`) · `windows-bootstrap.ps1` (exec-policy + browser) |
| [SETUP.md](SETUP.md) | Per-platform install + troubleshooting |
| [PUBLISHING.md](PUBLISHING.md) | What to ship / what to scrub before pushing |
| `CLAUDE.md` | Guidance for Claude Code working in this repo |

## Adapt to your own app

Same pattern, change URL + selector strategy:

| Use-case | URL | Selector hint |
|---|---|---|
| Synology DSM | `https://<id>.quickconnect.to` | role-based (treeitem, menuitem) |
| Proxmox | `https://<ip>:8006` | XPath through ExtJS tree |
| Home Assistant | `https://homeassistant.local:8123` | `data-domain` attributes |
| Grafana | `http://grafana.lan:3000` | `aria-label` on panels |
| Jenkins | `http://jenkins.lan:8080` | `role=link` with name |

Prompt Claude to `browser_snapshot` the target first — it derives stable `getByRole` / `getByText` selectors instead of guessing framework-generated CSS classes.

## Scope & ethics

Built for capturing services **you own or are authorized to access**. Use real credentials only on your own systems. Never commit `.env`, real `shots/*.png`, or rendered decks — they carry live data. The pre-publish scrub checklist is in [PUBLISHING.md](PUBLISHING.md).

## License

MIT — see [LICENSE](LICENSE).
