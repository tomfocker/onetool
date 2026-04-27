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

function ConvertTo-NativeArgument {
  param(
    [AllowEmptyString()]
    [string]$Argument
  )

  if ($null -eq $Argument -or $Argument.Length -eq 0) {
    return '""'
  }

  if ($Argument -notmatch '[\s"]') {
    return $Argument
  }

  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $backslashes = 0

  foreach ($char in $Argument.ToCharArray()) {
    if ($char -eq '\') {
      $backslashes += 1
      continue
    }

    if ($char -eq '"') {
      if ($backslashes -gt 0) {
        [void]$builder.Append(('\' * ($backslashes * 2)))
        $backslashes = 0
      }
      [void]$builder.Append('\"')
      continue
    }

    if ($backslashes -gt 0) {
      [void]$builder.Append(('\' * $backslashes))
      $backslashes = 0
    }

    [void]$builder.Append($char)
  }

  if ($backslashes -gt 0) {
    [void]$builder.Append(('\' * ($backslashes * 2)))
  }

  [void]$builder.Append('"')
  return $builder.ToString()
}

function Join-NativeArguments {
  param(
    [string[]]$Arguments
  )

  return (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
}

function Invoke-Scanner {
  param(
    [string]$ScannerPath,
    [string]$RootPath,
    [string]$EventsPath,
    [string]$StderrPath
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $ScannerPath
  $startInfo.Arguments = Join-NativeArguments @('scan', '--root', $RootPath)
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardOutputEncoding = $utf8NoBom
  $startInfo.StandardErrorEncoding = $utf8NoBom
  $startInfo.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  $eventsWriter = New-Object System.IO.StreamWriter -ArgumentList @($EventsPath, $true, $utf8NoBom)
  $stderrWriter = New-Object System.IO.StreamWriter -ArgumentList @($StderrPath, $true, $utf8NoBom)
  $eventsWriter.AutoFlush = $true
  $stderrWriter.AutoFlush = $true

  try {
    [void]$process.Start()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    while (-not $process.StandardOutput.EndOfStream) {
      $line = $process.StandardOutput.ReadLine()
      if ($null -ne $line) {
        $eventsWriter.WriteLine($line)
      }
    }

    $process.WaitForExit()
    $stderr = $stderrTask.Result
    if (-not [string]::IsNullOrEmpty($stderr)) {
      $stderrWriter.Write($stderr)
    }

    return $process.ExitCode
  } finally {
    $eventsWriter.Dispose()
    $stderrWriter.Dispose()
    $process.Dispose()
  }
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

  $exitCode = Invoke-Scanner -ScannerPath $scannerPath -RootPath $rootPath -EventsPath $eventsPath -StderrPath $stderrPath
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
