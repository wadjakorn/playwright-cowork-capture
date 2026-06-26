<#
  One-shot Windows prep for the Playwright MCP / capture toolkit.

  Fixes the two things that bite Windows users before anything else works:
    1. PowerShell execution policy that blocks npx (npx.ps1).
    2. The chrome-for-testing browser that @playwright/mcp needs on first run.

  Usage:  powershell -ExecutionPolicy Bypass -File scripts\windows-bootstrap.ps1
#>
$ErrorActionPreference = 'Stop'
$MCP_VERSION = '0.0.76'   # keep in sync with mcpb/package.json

Write-Host "== 1/3  PowerShell execution policy =="
$cur = Get-ExecutionPolicy -Scope CurrentUser
if ($cur -in @('Restricted', 'Undefined', 'AllSigned')) {
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
  Write-Host "   set CurrentUser -> RemoteSigned (was $cur). Open a NEW terminal for plain 'npx' to work."
} else {
  Write-Host "   OK ($cur) — npx scripts already allowed."
}

Write-Host "== 2/3  Node.js =="
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js >= 18 not found on PATH. Install the LTS from https://nodejs.org and re-run."
  exit 1
}
$v = (& node --version)
Write-Host "   Node $v at $($node.Source)"

Write-Host "== 3/3  Browser (chrome-for-testing) =="
# Use npx.cmd so this works even in a shell whose policy hasn't reloaded yet.
& npx.cmd -y "@playwright/mcp@$MCP_VERSION" install-browser chrome-for-testing
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Browser install returned non-zero — you can also run it later by asking Claude: @Playwright_MCP browser_install"
} else {
  Write-Host "   Browser ready in $env:LOCALAPPDATA\ms-playwright"
}

Write-Host ""
Write-Host "Done. Next: install dist\playwright-mcp.mcpb in Cowork (Settings -> Extensions), then fully quit & restart."
