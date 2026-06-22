# Publishing — what to ship, what to scrub

Before pushing to GitHub or sending the repo to someone else, run through this checklist. The current `shots/` and `*.pptx` files in your working tree contain real NAS data — they must not leave your machine.

---

## ✅ Ship these (commit to repo)

### Code
| File | Purpose |
|---|---|
| `capture.spec.ts` | Playwright spec — the deterministic flow |
| `playwright.config.ts` | viewport, retries, HTTPS, etc. |
| `annotate.py` | PIL post-processor for numbered pins (cross-platform fonts) |
| `build_deck.js` | pptxgenjs deck builder |

### Configs / manifests
| File | Purpose |
|---|---|
| `package.json` | npm deps + cross-platform scripts via `cross-env` |
| `package-lock.json` | reproducible install |
| `.gitignore` | (this repo's exclude list) |
| `.env.example` | credential template — never commit the real `.env` |
| `LICENSE` | MIT, with third-party attributions |

### Templates (examples — safe to share)
| File | Purpose |
|---|---|
| `shots/.gitkeep` | keep the empty dir present |
| `shots/metadata.example.json` | anonymized metadata shape |
| `pins.example.json` | annotation schema example |

### Docs
| File | Purpose |
|---|---|
| `README.md` | quick-start |
| `SETUP.md` | per-platform install + troubleshooting (macOS/Windows/Linux) |
| `COWORK_INSTRUCTIONS.md` | paste into Cowork project Instructions field |
| `PUBLISHING.md` | this file |

---

## ❌ Don't ship (PII / build artifacts)

All of these are excluded by `.gitignore` already, but double-check before pushing:

| Pattern | Why |
|---|---|
| `.env` | real credentials |
| `node_modules/` | rebuild from `package-lock.json` |
| `shots/*.png` | **real screenshots of your NAS — folder names, photo thumbnails, usernames** |
| `shots/annotated/` | annotated versions of above — same PII |
| `shots/metadata.json` | enumeration of real folders/items |
| `*.pptx` `*.docx` `*.pdf` | rendered decks with embedded screenshots |
| `.playwright-mcp/` | Playwright MCP runtime snapshots + console logs (per-session) |
| `playwright-report/` `test-results/` | Playwright test artifacts |
| `.DS_Store` `Thumbs.db` | OS noise |
| `*.mcpb` | binary bundle — distribute via release asset, not source tree |
| `*.log` | runtime logs |

---

## 🎁 Optional release assets (GitHub Releases tab, not in repo)

| File | How |
|---|---|
| `playwright-mcp.mcpb` | Build from `playwright-mcp-plugin/` source (see SETUP.md ทาง B), attach to the release for one-click install |
| Sample annotated demo PNG | a redacted example so visitors see what the tool produces |

---

## Pre-publish scrub command

```bash
# Confirm no real data sneaks in
find shots/ -name "*.png" 2>/dev/null               # should be empty
find . -name "*.pptx" -o -name "*.docx" 2>/dev/null # should be empty (outside node_modules)
test ! -f .env && echo "OK no .env"
test ! -d .playwright-mcp && echo "OK no playwright-mcp cache" || echo "WARN .playwright-mcp present — gitignored but check"

# Check what git is about to add
git status --short
git ls-files --others --exclude-standard
```

If any of those return real screenshots / decks / env files, abort the push.

---

## Recommended repo name + tagline

> `playwright-cowork-capture` — Capture local/LAN web flows from Cowork into a slide deck or annotated user-manual, end-to-end. macOS · Windows · Linux.

---

## Branch suggestion

- `main` — clean, no real data ever
- Don't push your real-data working branch. Keep DSM-specific tweaks in a private branch or a private fork

---

## After publishing

Update `README.md` with:
- Live link to the `.mcpb` release asset
- Screenshot of an annotated example (use synthetic test page like `httpbin.org`)
- Badge: Node ≥18, Python ≥3.9, Cowork compatible, MIT
