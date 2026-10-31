[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$retailRoot = Split-Path -Parent $PSScriptRoot
$retailLocal = Join-Path $retailRoot '.local'
$retailSavedEnv = @{}
foreach($retailEnvName in @('TEMP','TMP','PIP_CACHE_DIR','PYTHONPYCACHEPREFIX')) { $retailSavedEnv[$retailEnvName] = [Environment]::GetEnvironmentVariable($retailEnvName,'Process') }
try {
    foreach($retailFolder in @('tmp','pip-cache','pycache')) { New-Item -ItemType Directory -Path (Join-Path $retailLocal $retailFolder) -Force | Out-Null }
    $env:TEMP = Join-Path $retailLocal 'tmp'
    $env:TMP = $env:TEMP
    $env:PIP_CACHE_DIR = Join-Path $retailLocal 'pip-cache'
    $env:PYTHONPYCACHEPREFIX = Join-Path $retailLocal 'pycache'
    $retailPython = Join-Path $retailLocal 'venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $retailPython)) {
        $retailSystemPython = (Get-Command python -ErrorAction Stop).Source
        & $retailSystemPython -c 'import sys; sys.exit(0 if sys.version_info >= (3, 13) else 1)'
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.13 or newer is required for the analysis environment.' }
        & $retailSystemPython -m venv (Join-Path $retailLocal 'venv')
        if ($LASTEXITCODE -ne 0) { throw 'Virtual environment creation failed.' }
    }
    & $retailPython -c 'import sys; sys.exit(0 if sys.version_info >= (3, 13) else 1)'
    if ($LASTEXITCODE -ne 0) { throw 'The local analysis environment requires Python 3.13 or newer.' }
    & $retailPython -m pip install --only-binary=:all: --requirement (Join-Path $retailRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & $retailPython -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Dependency compatibility check failed.' }
    Write-Output 'Analysis environment ready in .local/venv; no global packages were changed.'
} finally {
    foreach($retailEnvName in $retailSavedEnv.Keys) { [Environment]::SetEnvironmentVariable($retailEnvName,$retailSavedEnv[$retailEnvName],'Process') }
}
