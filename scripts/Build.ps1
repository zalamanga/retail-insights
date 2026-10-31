[CmdletBinding()]
param([switch]$Sample)
$ErrorActionPreference = 'Stop'
$retailRoot = Split-Path -Parent $PSScriptRoot
$retailPython = Join-Path $retailRoot '.local\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $retailPython)) { throw 'Run scripts/Setup.ps1 first.' }
$retailSavedEnv = @{}
foreach($retailEnvName in @('TEMP','TMP','PYTHONPYCACHEPREFIX')) { $retailSavedEnv[$retailEnvName] = [Environment]::GetEnvironmentVariable($retailEnvName,'Process') }
try {
    $env:TEMP = Join-Path $retailRoot '.local\tmp'
    $env:TMP = $env:TEMP
    $env:PYTHONPYCACHEPREFIX = Join-Path $retailRoot '.local\pycache'
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    if ($Sample) { & $retailPython (Join-Path $PSScriptRoot 'build.py') --sample }
    else {
        & $retailPython (Join-Path $PSScriptRoot 'download_data.py')
        if ($LASTEXITCODE -ne 0) { throw 'Source download or fingerprint verification failed.' }
        & $retailPython (Join-Path $PSScriptRoot 'build.py')
    }
    if ($LASTEXITCODE -ne 0) { throw 'Analysis build failed.' }
} finally {
    foreach($retailEnvName in $retailSavedEnv.Keys) { [Environment]::SetEnvironmentVariable($retailEnvName,$retailSavedEnv[$retailEnvName],'Process') }
}
