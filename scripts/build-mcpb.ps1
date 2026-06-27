<#
  Builds playwright-mcp.mcpb from ./mcpb (Windows / PowerShell).

  Vendors a pinned @playwright/mcp into the bundle (so it never depends on npx
  or the network at runtime), then zips the folder and renames it to .mcpb.

  Usage:   powershell -ExecutionPolicy Bypass -File scripts\build-mcpb.ps1
  Output:  dist\playwright-mcp.mcpb
#>
$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$bundle = Join-Path $root 'mcpb'
$dist   = Join-Path $root 'dist'
$zip    = Join-Path $dist 'playwright-mcp.zip'
$mcpb   = Join-Path $dist 'playwright-mcp.mcpb'

Write-Host "==> Installing pinned dependencies into bundle..."
Push-Location $bundle
& npm.cmd install --omit=dev --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed" }
Pop-Location

# Strip dev/junk that must not ship in the .mcpb.
Get-ChildItem $bundle -Recurse -Include '*.log','*.bak','*.bak-*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "==> Packaging..."
New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zip)  { Remove-Item $zip -Force }
if (Test-Path $mcpb) { Remove-Item $mcpb -Force }

# Build the zip manually so entry paths use FORWARD slashes (the zip spec, and
# what macOS/Linux + Cowork expect). PowerShell 5.1 Compress-Archive writes
# backslashes, which yields a corrupt .mcpb on non-Windows. manifest.json sits
# at the archive root because we make paths relative to mcpb\.
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
$fs  = [System.IO.File]::Open($mcpb, [System.IO.FileMode]::Create)
$arc = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$prefix = $bundle.TrimEnd('\') + '\'
$files = Get-ChildItem $bundle -Recurse -File |
  Where-Object { $_.Name -ne '.gitignore' -and $_.Extension -notin '.log','.bak' -and $_.Name -notmatch 'bak-' }
foreach ($f in $files) {
  $rel = $f.FullName.Substring($prefix.Length) -replace '\\', '/'
  $entry = $arc.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open()
  $in = [System.IO.File]::OpenRead($f.FullName)
  $in.CopyTo($es)
  $in.Dispose(); $es.Dispose()
}
$arc.Dispose(); $fs.Dispose()

Write-Host "==> Done: $mcpb"
Write-Host "    Install: open Cowork/Claude Desktop -> Settings -> Extensions -> drag the .mcpb in, then fully restart."
