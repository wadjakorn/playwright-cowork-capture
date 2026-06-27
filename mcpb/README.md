# Playwright MCP bundle (`.mcpb`)

A hardened Claude Desktop / Cowork extension that exposes Microsoft's
[`@playwright/mcp`](https://www.npmjs.com/package/@playwright/mcp) as
`mcp__Playwright_MCP__*` tools, driving a real local Chromium with full LAN access.

## Why this exists (don't "just use npx")

The obvious launcher — `npx @playwright/mcp@latest` from a tiny `server.js` —
**fails under Claude Desktop on Windows**. Two independent reasons, both handled
in [`server.js`](server.js):

1. **No runtime npx / `@latest`.** The host runs `server.js` with its built-in
   (Electron-as-Node) runtime. A shell + per-launch network resolve is fragile
   there; the server dies ~5–7 s after `initialize`. We ship a **pinned, vendored**
   `@playwright/mcp` (in `node_modules`, added at build time) and launch it
   directly with the real system Node — no npx, no shell, no network.
2. **No `stdio: 'inherit'`.** Under Electron-as-Node, inheriting stdin does *not*
   forward the host's stdin pipe to the grandchild, so the MCP server reads EOF
   and exits cleanly (code 0). We bridge stdin/stdout/stderr **manually** with
   Node streams.

Node is discovered from `PATH`, then common install dirs, overridable with
`PLAYWRIGHT_MCP_NODE`; if no system Node exists it falls back to the host binary
in Node mode. Works on win32 / darwin / linux.

## Build

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File ..\scripts\build-mcpb.ps1
```

```bash
# macOS / Linux
mkdir -p dist && cd mcpb && npm install --omit=dev && zip -r ../dist/playwright-mcp.mcpb . -x '*.log' '*.bak*' '.gitignore'
```

Either way the result is `dist/playwright-mcp.mcpb`. `manifest.json` must sit at
the **archive root** (zip the folder *contents*, not the folder).

## Install

1. Cowork / Claude Desktop → **Settings → Extensions** → drag in
   `playwright-mcp.mcpb`.
2. **Fully quit and restart** (tray icon, not just the window).
3. First run needs a browser: it auto-installs, or run
   `scripts\windows-bootstrap.ps1`, or ask Claude `@Playwright_MCP browser_install`.

## Update the pinned version

Bump `@playwright/mcp` in [`package.json`](package.json) **and** `$MCP_VERSION`
in `scripts/windows-bootstrap.ps1`, then rebuild. Pinning keeps every machine
identical and avoids a network resolve on each launch.

## If it ever crash-loops again

Claude Desktop does **not** pipe an MCP server's stderr into
`%APPDATA%\Claude\logs\mcp-server-*.log`. To debug, add `fs.appendFileSync` logging
to `server.js` (and pipe the child's stderr to a file), restart, and read that file.
