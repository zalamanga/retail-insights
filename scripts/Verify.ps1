[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$retailRoot = Split-Path -Parent $PSScriptRoot
$retailPython = Join-Path $retailRoot '.local\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $retailPython)) { throw 'Run scripts/Setup.ps1 first.' }
$retailSavedEnv = @{}
foreach($retailEnvName in @('TEMP','TMP','PYTHONPYCACHEPREFIX')) { $retailSavedEnv[$retailEnvName] = [Environment]::GetEnvironmentVariable($retailEnvName,'Process') }
Push-Location -LiteralPath $retailRoot
try {
    $env:TEMP = Join-Path $retailRoot '.local\tmp'
    $env:TMP = $env:TEMP
    $env:PYTHONPYCACHEPREFIX = Join-Path $retailRoot '.local\pycache'
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    & $retailPython -m pytest -q --basetemp (Join-Path $retailRoot '.local\pytest-tmp')
    if ($LASTEXITCODE -ne 0) { throw 'Python/SQL tests failed.' }
    & node --test dashboard/tests/model.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard model tests failed.' }
    & node scripts/check-data.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Published snapshot validation failed.' }
    & $retailPython scripts/execute_notebook.py
    if ($LASTEXITCODE -ne 0) { throw 'Notebook execution failed.' }
} finally {
    Pop-Location
    foreach($retailEnvName in $retailSavedEnv.Keys) { [Environment]::SetEnvironmentVariable($retailEnvName,$retailSavedEnv[$retailEnvName],'Process') }
}
