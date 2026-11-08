# Install autocalc from the newest release tag (ADR-0019). $env:AUTOCALC_REF pins another ref.
$ErrorActionPreference = 'Stop'

$Repo = if ($env:AUTOCALC_REPO) { $env:AUTOCALC_REPO } else { 'https://github.com/araujoviana/autocalc.git' }
function Die($msg) { Write-Error "autocalc install: $msg"; exit 1 }

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
}

$BunBin = if ($env:BUN_INSTALL) { "$env:BUN_INSTALL\bin" } else { "$env:USERPROFILE\.bun\bin" }
if (-not (Test-Path $BunBin)) { New-Item -ItemType Directory -Path $BunBin -Force | Out-Null }
Remove-Item -Force "$BunBin\autocalc", "$BunBin\autocalc.cmd", "$BunBin\autocalc-mcp", "$BunBin\autocalc-mcp.cmd" -ErrorAction SilentlyContinue

$isLocal = $false
if ($args -contains '--local' -or $args -contains '-l') {
    $isLocal = $true
} elseif (-not $env:AUTOCALC_REF -and (Test-Path '.\package.json')) {
    $content = Get-Content '.\package.json' -Raw -ErrorAction SilentlyContinue
    if ($content -match '"name":\s*"autocalc"') {
        $isLocal = $true
    }
}

if ($isLocal) {
    bun install
    if ($LASTEXITCODE) { Die 'could not install local dependencies.' }
    bun add -g --force .
    if ($LASTEXITCODE) { Die 'bun could not install local package.' }
    $ref = 'local'
} else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die 'git is required.' }
    $ref = $env:AUTOCALC_REF
    if (-not $ref) {
        $tags = git ls-remote --tags --refs $Repo 'v*' 2>$null | ForEach-Object { ($_ -split 'refs/tags/')[1] } |
            Where-Object { $_ -match '^v\d+\.\d+\.\d+$' }
        $ref = $tags | Sort-Object { [version]$_.Substring(1) } | Select-Object -Last 1
        if (-not $ref) { $ref = 'main' }
    }
    bun add -g --force "git+$Repo#$ref"
    if ($LASTEXITCODE) { Die "bun could not install $ref." }
}

if (Get-Command claude -ErrorAction SilentlyContinue) {
    $mcpOut = claude mcp add hwc-calculator -- autocalc-mcp 2>&1
    if ($LASTEXITCODE -and $mcpOut -notmatch 'already exists') {
        Write-Host 'Could not register the MCP server; run: claude mcp add hwc-calculator -- autocalc-mcp'
    }
} else {
    Write-Host 'To use it from an agent: claude mcp add hwc-calculator -- autocalc-mcp'
}

Write-Host "Installed autocalc $ref. Next: autocalc doctor, then autocalc login."
Write-Host "If 'autocalc' is not found, open a new terminal."
