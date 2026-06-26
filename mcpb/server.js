#!/usr/bin/env node
/**
 * Robust launcher for @playwright/mcp inside a Claude Desktop / Cowork .mcpb.
 *
 * Background — two failure modes this guards against (both seen on Windows):
 *
 *   1. Don't shell out to `npx @playwright/mcp@latest`.
 *      The host loads this file with its built-in (Electron-as-Node) runtime.
 *      A shell + per-launch network resolve of `@latest` is slow/fragile there
 *      and the server dies ~5-7s after `initialize`. We instead run a PINNED,
 *      VENDORED copy (./node_modules/@playwright/mcp) directly — no npx, no
 *      shell, no network. (The build step installs node_modules into the .mcpb.)
 *
 *   2. Don't use stdio: 'inherit'.
 *      Under Electron-as-Node, inheriting stdin does NOT forward the host's
 *      stdin pipe to a grandchild process, so the MCP server sees EOF and exits
 *      cleanly (code 0). We bridge stdin/stdout/stderr MANUALLY with streams.
 *
 * Node selection: prefer a real system Node (PATH, then common install dirs,
 * overridable via PLAYWRIGHT_MCP_NODE); fall back to the host binary running in
 * Node mode. Cross-platform (win32 / darwin / linux).
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const isWin = process.platform === 'win32';
const cli = path.join(__dirname, 'node_modules', '@playwright', 'mcp', 'cli.js');

// Capture-friendly defaults; override via PLAYWRIGHT_MCP_ARGS (space-separated).
const defaultFlags = [
  '--browser=chromium',
  '--isolated',
  '--ignore-https-errors',
  '--viewport-size=1440,900',
];
const flags = process.env.PLAYWRIGHT_MCP_ARGS
  ? process.env.PLAYWRIGHT_MCP_ARGS.split(' ').filter(Boolean)
  : defaultFlags;

function exists(p) { try { return !!p && fs.existsSync(p); } catch (e) { return false; } }

function findSystemNode() {
  const exe = isWin ? 'node.exe' : 'node';
  if (exists(process.env.PLAYWRIGHT_MCP_NODE)) return process.env.PLAYWRIGHT_MCP_NODE;
  // Scan PATH.
  const sep = isWin ? ';' : ':';
  for (const dir of (process.env.PATH || '').split(sep)) {
    if (dir && exists(path.join(dir, exe))) return path.join(dir, exe);
  }
  // Common install locations.
  const common = isWin
    ? ['C:\\Program Files\\nodejs\\node.exe', 'C:\\Program Files (x86)\\nodejs\\node.exe']
    : ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node'];
  return common.find(exists) || null;
}

if (!exists(cli)) {
  console.error('[playwright-mcp] vendored CLI missing at ' + cli +
    ' — rebuild the bundle so node_modules is included.');
  process.exit(1);
}

const sysNode = findSystemNode();
const env = { ...process.env };
let bin, args;
if (sysNode) {
  bin = sysNode;
  args = [cli, ...flags];
} else {
  // Fallback: re-run the host binary as Node.
  bin = process.execPath;
  args = [cli, ...flags];
  env.ELECTRON_RUN_AS_NODE = '1';
}

const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env });

// Manual stdio bridge (see header note #2).
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on('exit', (code) => process.exit(code == null ? 0 : code));
child.on('error', (err) => {
  console.error('[playwright-mcp] failed to start server: ' + err.message);
  process.exit(1);
});
process.on('SIGTERM', () => { try { child.kill(); } catch (e) {} });
process.on('SIGINT', () => { try { child.kill(); } catch (e) {} });
