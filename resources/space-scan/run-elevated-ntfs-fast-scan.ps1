param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'

function Write-ExitCode {
  param(
    [string]$Path,
    [int]$Code
  )

  Set-Content -LiteralPath $Path -Value $Code -NoNewline -Encoding utf8
}

$stderrPath = $null
$exitCodePath = $null

try {
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  $scannerPath = [string]$manifest.scannerPath
  $rootPath = [string]$manifest.rootPath
  $eventsPath = [string]$manifest.eventsPath
  $stderrPath = [string]$manifest.stderrPath
  $exitCodePath = [string]$manifest.exitCodePath

  New-Item -ItemType File -Force -Path $eventsPath | Out-Null
  New-Item -ItemType File -Force -Path $stderrPath | Out-Null

  & $scannerPath scan --root $rootPath 2>> $stderrPath | ForEach-Object {
    Add-Content -LiteralPath $eventsPath -Value $_ -Encoding utf8
  }

  $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { [int]$LASTEXITCODE }
  Write-ExitCode -Path $exitCodePath -Code $exitCode
  exit $exitCode
} catch {
  $message = $_ | Out-String

  if ($stderrPath) {
    Add-Content -LiteralPath $stderrPath -Value $message -Encoding utf8
  }

  if ($exitCodePath) {
    Write-ExitCode -Path $exitCodePath -Code 1
  }

  exit 1
}
