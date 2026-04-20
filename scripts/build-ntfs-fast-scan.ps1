[CmdletBinding()]
param(
  [ValidateSet('Debug', 'Release')]
  [string]$Profile = 'Release'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$crateDir = Join-Path $repoRoot 'native\ntfs-fast-scan'
$manifestPath = Join-Path $crateDir 'Cargo.toml'
$targetTriple = 'x86_64-pc-windows-msvc'
$toolchain = 'stable-x86_64-pc-windows-msvc'
$binaryName = 'ntfs-fast-scan.exe'
$profileDir = $Profile.ToLowerInvariant()
$compiledBinaryPath = Join-Path $crateDir "target\$targetTriple\$profileDir\$binaryName"
$stagingDir = Join-Path $repoRoot 'resources\space-scan'
$stagingBinaryPath = Join-Path $stagingDir $binaryName
$cargoLockPath = Join-Path $crateDir 'Cargo.lock'

function Import-VsDevEnvironment {
  $vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path -LiteralPath $vswherePath)) {
    return
  }

  $installationPath = & $vswherePath -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($installationPath)) {
    return
  }

  $vsDevCmdPath = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
  if (-not (Test-Path -LiteralPath $vsDevCmdPath)) {
    return
  }

  $environmentLines = & cmd.exe /d /s /c "`"$vsDevCmdPath`" -no_logo -arch=x64 -host_arch=x64 >nul && set"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to import Visual Studio developer environment from $vsDevCmdPath."
  }

  foreach ($line in $environmentLines) {
    $name, $value = $line -split '=', 2
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Could not find Rust scanner manifest at $manifestPath."
}

Import-VsDevEnvironment

$cargoArgs = @(
  'build',
  '--manifest-path', $manifestPath,
  '--target', $targetTriple
)

if (Test-Path -LiteralPath $cargoLockPath) {
  $cargoArgs += '--locked'
}

if ($Profile -eq 'Release') {
  $cargoArgs += '--release'
}

$rustupCommand = Get-Command -Name 'rustup.exe' -ErrorAction SilentlyContinue
if ($null -ne $rustupCommand) {
  $cargoPath = (& $rustupCommand.Source 'which' 'cargo' '--toolchain' $toolchain).Trim()
  $rustcPath = (& $rustupCommand.Source 'which' 'rustc' '--toolchain' $toolchain).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($cargoPath) -or [string]::IsNullOrWhiteSpace($rustcPath)) {
    throw "Failed to resolve Rust toolchain binaries for $toolchain."
  }

  $toolchainBinDir = Split-Path -Path $cargoPath -Parent
  $env:RUSTUP_TOOLCHAIN = $toolchain
  $env:RUSTC = $rustcPath
  $env:PATH = "$toolchainBinDir;$env:PATH"

  & $cargoPath @cargoArgs
} else {
  $cargoCommand = Get-Command -Name 'cargo.exe' -ErrorAction Stop
  & $cargoCommand.Source @cargoArgs
}

if ($LASTEXITCODE -ne 0) {
  throw "Cargo build failed for ntfs-fast-scan."
}

if (-not (Test-Path -LiteralPath $compiledBinaryPath)) {
  throw "Expected scanner binary was not produced at $compiledBinaryPath."
}

New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
Copy-Item -LiteralPath $compiledBinaryPath -Destination $stagingBinaryPath -Force

Write-Host "Staged NTFS fast scanner to $stagingBinaryPath"
