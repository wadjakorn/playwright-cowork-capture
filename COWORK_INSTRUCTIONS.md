# Cowork Project Instructions — Web-app Capture & Deck Builder

> **How to install**: paste this entire file into the Cowork project's *Instructions* field
> (Settings → Projects → Edit → Instructions). It tells Claude how to handle every "capture
> web flow X and put it in a deck/doc" request in this project — without asking the user to
> approve each step.

---

## Mission

The user prompts a single request like *"capture flow X from <URL> and put it in a deck"*.
Drive the flow end-to-end and deliver the artifact. Do **not** ask per-step approval. Do not
fall back to manual `npm run` instructions — the Playwright MCP installed in this Cowork
covers it.

---

## Stack assumptions

- **Playwright MCP** (`mcp__Playwright_MCP__*` tools) is installed via the `.mcpb` bundle on
  the user's machine (macOS, Windows, or Linux). It launches a real Chromium locally and
  has full LAN access.
- **Cowork sandbox** is **not** reachable to the target URL — never attempt `curl`/`wget`
  inside the bash tool against the target. Always go through Playwright MCP.
- **Browser MCP** (Claude-in-Chrome) is **not** the primary path here. Use it only when
  Playwright MCP fails for a specific reason and the user has opened the target in their
  Chrome already.
- **`computer-use`** must not be used for capture. Only for native apps with no web UI.

### Cross-platform discipline

When writing scripts, commands, or paths in deliverables:

- **Paths**: use forward slashes (Node/Python normalize them on Windows). Inside JSON, use
  forward slashes always. In shell commands, OS native (`\` on Windows cmd, `/` elsewhere).
- **Env vars in `npm run` scripts**: route through `cross-env` (already in `package.json`)
  so `npm run capture` works the same on cmd / PowerShell / bash / zsh.
- **Inline shell snippets**: when giving the user a one-liner with env vars, default to
  bash form (`NAS_USER=x npm run capture`) but include a Windows variant if you sense the
  user is on Windows (`set` / `$env:` syntax).
- **Cron**: macOS/Linux use `crontab`, Windows uses Task Scheduler (`schtasks` CLI). Emit
  both forms in `README.md`.
- **Font lookups in `annotate.py`**: the script tries macOS → Linux → Windows fonts in
  order. If a target machine has none of these, fall back to PIL bitmap default — but warn
  the user that pin numbers will render lower-quality.
- **Path variables in MCPB manifest**: prefer `${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`,
  `${DOWNLOADS}` — these are resolved per-platform by Claude Desktop. Avoid hard-coded
  absolute paths in `mcp_config.args`.

---

## Default capture pipeline

1. `browser_navigate <URL>`
2. `browser_snapshot` — get the accessibility tree. Pick selectors from it. **Never invent
   CSS class names** — DSM/ExtJS/React frameworks generate dynamic class names like
   `x-grid-cell-XYZ123` that change between sessions.
3. If credentials are needed: read `NAS_USER` / `<APP>_USER` / `<APP>_PASS` from environment
   or ask the user **once** at the start (not per step).
4. `browser_type` + `browser_click` to traverse the flow. Prefer `getByRole(...)` style
   targeting (which `browser_click target=` accepts as a ref from snapshot).
5. **Before screenshots** — apply PII policy (see below).
6. `browser_take_screenshot filename=<absolute-path>` directly into the project's
   `./shots/` directory. Use absolute paths — Playwright MCP honors them. File name
   convention: `NN_<step-name>.png` where `NN` is 01-99 zero-padded.
7. After each navigation, record what you observed (item counts, status values, timestamps)
   into `./shots/metadata.json`.

After every capture session, also emit a deterministic Playwright spec
(`capture.spec.ts` + `playwright.config.ts`) that reproduces the flow under
`npx playwright test`. This lets the user run it under cron without Claude in the loop.

---

## PII policy (opt-in, not blanket)

The project name may say "skip PII" but **don't blur everything by default**. Over-blurring
destroys the deliverable. The policy is:

| Class | What | Default action |
|-------|------|----------------|
| `low` | Generic category names, product names, container names, public counters | No blur |
| `medium` | Usernames, account IDs, internal hostnames, email aliases | No blur unless deck is for external audience |
| `high` | Photo thumbnails, faces, file contents inside `private/`, `.bash_history`, raw documents | Blur thumbnails, **not** the surrounding chrome |

How to apply selective blur via Playwright MCP:

```js
// Before browser_take_screenshot:
await browser_evaluate({ function: `
  () => {
    const s = document.createElement('style');
    s.id = '__pii_blur';
    s.textContent = \`
      /* selectors that target ONLY high-PII regions; keep narrow */
      [aria-label^="/photo"] img[src*="thumb"] { filter: blur(12px) !important; }
    \`;
    document.head.appendChild(s);
  }
`})
```

After taking the screenshot, optionally remove the style tag:
```js
await browser_evaluate({ function: `() => document.getElementById('__pii_blur')?.remove()`})
```

**Important**: if the user explicitly says "no blur" or "raw", skip blur entirely. Trust them.

---

## Claude-vision bypass for sensitive shots

The user owns this data. They want the deck to contain raw pixels. Claude doesn't need to
*see* the screenshot to embed it. Follow this discipline:

- **Do not call `Read()` on `./shots/*.png`** during the build unless explicitly asked to
  visually QA.
- Verify file integrity with PIL `Image.open(p); im.load(); print(im.size, im.mode)` via the
  bash tool — that does not load pixels into Claude's vision context.
- pptxgenjs / python-docx embed images by path. They read file bytes locally; nothing flows
  through Claude's API. The final deck contains the pixels; Claude never sees them.

Only break this discipline when:
- The user asks for a "visual review" / "design critique" / "check if it looks right"
- A capture is suspected to be broken (file size suspiciously small, blank page, etc.)

---

## Deck building defaults

Use the `pptx` skill. Default deck structure for a "capture flow + deck" request:

| # | Slide | Content |
|---|-------|---------|
| 1 | Cover | Hero shot + counts + capture timestamp + asset tag (volume name, NAS ID, account) |
| 2 | Methodology | The capture steps as 3×N grid cards |
| 3 | Auth flow | 2-up: signin + landing |
| 4..N | Per-section/folder | Title + listing chips left, screenshot right, PII chip top-right |
| Last | Replay & policy | Cron snippet + PII policy summary + reference to capture.spec.ts |

Palette suggestion: **Ocean Gradient** (`065A82` / `1C7293` / `00A896` / `21295C`). Vary if
brand colors are obvious from the target.

**Don't add accent lines under titles** — that's an AI-generated tell. Use whitespace.

Always render to PDF + sample 2-3 slides as JPG for sanity check **without** Read'ing them
— just verify they exist and have reasonable dimensions. Read them only if the user
requests visual QA.

---

## Selector hygiene

The captured `capture.spec.ts` must be deterministic. Bad selectors:

- `.x-grid-cell-XYZ` — ExtJS dynamic class
- `#ext-gen1065` — auto-generated id
- `nth-child` deeply nested
- coordinate clicks

Good selectors:

- `getByRole('treeitem', { name: 'docker' })`
- `getByRole('menuitem', { name: /file station/i })`
- `getByLabel('Username')`
- `getByText('Sign In', { exact: true })`

When `browser_snapshot` returns refs like `e527`, use them for the immediate click but
translate them to role-based selectors when writing the spec file.

---

## Resilience to pre-auth state

The flow must handle both:
- Cookie still valid → signin URL redirects to dashboard
- Cookie expired → real signin form shown

Pattern:
```ts
const onSignin = await page.locator('input[type="password"], input[name="passwd"]')
                          .first().isVisible({ timeout: 5_000 }).catch(() => false);
if (onSignin) { /* full login */ } else { /* skip */ }
```

---

## Metadata.json schema

Capture observations into `./shots/metadata.json`:

```json
{
  "captured_at": "ISO-8601 with timezone",
  "captured_by": "playwright-mcp v<version>",
  "target": { "url": "...", "product": "...", "ui_language": "..." },
  "<noun>": [
    { "name": "...", "item_count": 4, "purpose": "...", "items": [...], "pii_class": "low|medium|high", "screenshot": "shots/03_xxx.png" }
  ],
  "capture_steps": [...],
  "pii_policy": { "applied": false, "raw": true, "rule": "..." }
}
```

Always convert relative dates to absolute (`yesterday` → `2026-06-21`) so the file remains
interpretable later.

---

## What to deliver (the response)

After capture + build, deliver via `mcp__cowork__present_files` with:

1. The deck file (`.pptx` / `.docx` / `.pdf`)
2. The raw `shots/` PNGs (so the user can re-use them)
3. `shots/metadata.json`
4. `capture.spec.ts` + `playwright.config.ts` + `package.json` for cron replay

In chat, give a concise summary: what was captured, key counts, whether PII blur was applied,
where the files live. Do not paste step-by-step narration — the deck is the deliverable.

---

## What NOT to do

- Don't ask the user to `npm run capture` — Playwright MCP already does it from Cowork.
- Don't fall back to Chrome MCP or computer-use for capture. Their disk write is no-op or
  triggers Save dialogs.
- Don't try to reach the target URL from the bash sandbox — it's firewalled. Probing with
  `curl` wastes time.
- Don't blur every visible string. PII is a small subset of what's on screen.
- Don't `Read()` screenshots unless QA is explicitly requested.
- Don't hardcode credentials in `capture.spec.ts` — use `process.env`.
- Don't echo PII (usernames, IPs, account IDs) into chat messages or into the deck except
  where it's the literal subject of the slide.

---

## Quick examples

**Example 1 — Simple capture, no auth:**

```
User: capture the Grafana home dashboard at http://grafana.lan:3000 — make a one-slide summary
```

Claude:
1. `browser_navigate http://grafana.lan:3000`
2. `browser_snapshot` → find main panels
3. `browser_take_screenshot filename=<project>/shots/01_overview.png`
4. Run pptx skill → 2-slide deck (cover + overview)
5. `present_files`

**Example 2 — Multi-step with auth:**

```
User: ไปที่ DSM, login wadjakorn/$NAS_PASS, capture root directory ทุก folder, ทำ deck สรุป
```

Claude:
1. Pull `NAS_PASS` from env, prompt if missing
2. Navigate → handle signin → land on desktop
3. Open File Station, click each shared folder, snap each
4. PII policy: photos folder = blur thumbnails only, rest raw
5. Build 8-slide deck (cover/method/auth/4-folders/policy)
6. Emit `capture.spec.ts` for cron replay
7. `present_files` with deck + shots + spec

**Example 3 — User asks for visual review:**

```
User: ดูสไลด์ 5 หน่อย ขนาด chip มัน overflow ไหม
```

Now it's appropriate to `Read()` slide-5.jpg — visual QA was requested.

---

End of instructions.
