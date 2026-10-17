# Install autocalc from the newest release tag (ADR-0013). $env:AUTOCALC_REF pins another ref.
$ErrorActionPreference = 'Stop'

$Repo = if ($env:AUTOCALC_REPO) { $env:AUTOCALC_REPO } else { 'https://github.com/araujoviana/autocalc.git' }
function Die($msg) { Write-Error "autocalc install: $msg"; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die 'git is required.' }
$ref = $env:AUTOCALC_REF
if (-not $ref) {
    $tags = git ls-remote --tags --refs $Repo 'v*' | ForEach-Object { ($_ -split 'refs/tags/')[1] } |
        Where-Object { $_ -match '^v\d+\.\d+\.\d+$' }
    $ref = $tags | Sort-Object { [version]$_.Substring(1) } | Select-Object -Last 1
    if (-not $ref) { Die "no release tag (vX.Y.Z) found in $Repo. Set `$env:AUTOCALC_REF to install another ref." }
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}

uv tool install --force "git+$Repo@$ref"
if ($LASTEXITCODE) { Die "uv could not install $ref." }

if (Get-Command claude -ErrorAction SilentlyContinue) {
    claude mcp add hwc-calculator -- autocalc-mcp
    if ($LASTEXITCODE) { Write-Host 'Could not register the MCP server; run: claude mcp add hwc-calculator -- autocalc-mcp' }
} else {
    Write-Host 'To use it from an agent: claude mcp add hwc-calculator -- autocalc-mcp'
}

Write-Host "Installed autocalc $ref. Next: autocalc doctor, then autocalc login."
Write-Host "If 'autocalc' is not found, open a new terminal."
