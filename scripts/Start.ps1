[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 8103)
$ErrorActionPreference = 'Stop'
$retailRoot = Split-Path -Parent $PSScriptRoot
$retailPython = Join-Path $retailRoot '.local\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $retailPython)) { $retailPython = (Get-Command python -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath (Join-Path $retailRoot 'dashboard\data\analysis.json'))) { throw 'The aggregate snapshot is missing. Run scripts/Build.ps1 first.' }
& $retailPython (Join-Path $PSScriptRoot 'serve.py') --port $Port
if ($LASTEXITCODE -ne 0) { throw 'Dashboard server stopped with an error.' }
