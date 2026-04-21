import { spawn as defaultSpawn } from 'child_process'
import fs from 'node:fs'
import { app } from 'electron'
import path from 'node:path'
import type { TaskbarAppearancePreset } from '../../../shared/taskbarAppearance'
import type { IpcResponse } from '../../../shared/types'
import { execPowerShellEncoded as defaultExecPowerShellEncoded } from '../../utils/processUtils'

type TaskbarAppearanceInput = {
  preset: TaskbarAppearancePreset
  intensity: number
  tintHex: string
}

type PowerShellRunner = (script: string, timeoutMs?: number) => Promise<string>

type SpawnLike = typeof defaultSpawn

type TranslucentTbAdapterDependencies = {
  userDataPath?: string
  fsModule?: Pick<typeof fs, 'existsSync'>
  fsPromises?: Pick<typeof fs.promises, 'mkdir' | 'rm' | 'writeFile'>
  execPowerShellEncoded?: PowerShellRunner
  spawn?: SpawnLike
}

const HELPER_RELEASES_API_URL = 'https://api.github.com/repos/TranslucentTB/TranslucentTB/releases'
const SETTINGS_SCHEMA_URL = 'https://TranslucentTB.github.io/settings.schema.json'

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function clampIntensity(intensity: number): number {
  return Math.max(0, Math.min(100, Math.trunc(intensity)))
}

function mapPresetToHelperAccent(preset: TaskbarAppearancePreset): 'normal' | 'clear' | 'blur' | 'acrylic' {
  switch (preset) {
    case 'transparent':
      return 'clear'
    case 'blur':
      return 'blur'
    case 'acrylic':
      return 'acrylic'
    case 'default':
    default:
      return 'normal'
  }
}

function buildInstallScript(archivePath: string, helperDirectory: string): string {
  const escapedArchivePath = escapePowerShellSingleQuoted(archivePath)
  const escapedHelperDirectory = escapePowerShellSingleQuoted(helperDirectory)
  const escapedReleasesApiUrl = escapePowerShellSingleQuoted(HELPER_RELEASES_API_URL)

  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$releasesApiUrl = '${escapedReleasesApiUrl}'`,
    `$archivePath = '${escapedArchivePath}'`,
    `$helperDirectory = '${escapedHelperDirectory}'`,
    "$releaseHeaders = @{ 'User-Agent' = 'onetool-taskbar-helper' }",
    '$releases = Invoke-RestMethod -Headers $releaseHeaders -Uri $releasesApiUrl',
    "$portableAsset = $null",
    'foreach ($release in $releases) {',
    "  $portableAsset = @($release.assets | Where-Object { $_.name -eq 'TranslucentTB-portable-x64.zip' } | Select-Object -First 1)[0]",
    '  if ($portableAsset) { break }',
    '}',
    "if (-not $portableAsset) { throw 'Portable TranslucentTB release asset not found' }",
    'New-Item -ItemType Directory -Force -Path $helperDirectory | Out-Null',
    'Invoke-WebRequest -UseBasicParsing -Headers $releaseHeaders -Uri $portableAsset.browser_download_url -OutFile $archivePath',
    'Expand-Archive -LiteralPath $archivePath -DestinationPath $helperDirectory -Force',
    "Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue",
    "Write-Output 'install-success'"
  ].join('\n')
}

function buildRunningCheckScript(executablePath: string): string {
  const escapedExecutablePath = escapePowerShellSingleQuoted(executablePath)

  return [
    "$ErrorActionPreference = 'Stop'",
    `$targetPath = '${escapedExecutablePath}'`,
    '$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $targetPath })',
    "if ($matches.Count -gt 0) { Write-Output 'running:true-marker' } else { Write-Output 'running:false-marker' }"
  ].join('\n')
}

function buildStopScript(executablePath: string): string {
  const escapedExecutablePath = escapePowerShellSingleQuoted(executablePath)

  return [
    "$ErrorActionPreference = 'Stop'",
    `$targetPath = '${escapedExecutablePath}'`,
    '$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $targetPath })',
    'foreach ($process in $matches) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }',
    "Write-Output 'stop-success'"
  ].join('\n')
}

function buildHelperSettings(input: TaskbarAppearanceInput) {
  const accent = mapPresetToHelperAccent(input.preset)
  const appearance: Record<string, unknown> = {
    accent,
    color: input.tintHex,
    show_line: false
  }

  if (accent === 'blur') {
    appearance.blur_radius = Math.round((clampIntensity(input.intensity) / 100) * 750)
  }

  return {
    $schema: SETTINGS_SCHEMA_URL,
    desktop_appearance: appearance,
    hide_tray: true,
    disable_saving: true,
    verbosity: 'off',
    use_xaml_context_menu: false,
    copy_dlls: false
  }
}

export class TranslucentTbAdapter {
  private readonly userDataPath: string
  private readonly fsModule: Pick<typeof fs, 'existsSync'>
  private readonly fsPromises: Pick<typeof fs.promises, 'mkdir' | 'rm' | 'writeFile'>
  private readonly execPowerShellEncoded: PowerShellRunner
  private readonly spawn: SpawnLike

  constructor(dependencies: TranslucentTbAdapterDependencies = {}) {
    this.userDataPath = dependencies.userDataPath ?? app.getPath('userData')
    this.fsModule = dependencies.fsModule ?? fs
    this.fsPromises = dependencies.fsPromises ?? fs.promises
    this.execPowerShellEncoded = dependencies.execPowerShellEncoded ?? defaultExecPowerShellEncoded
    this.spawn = dependencies.spawn ?? defaultSpawn
  }

  private get helperDirectory(): string {
    return path.join(this.userDataPath, 'taskbar-appearance-helper', 'translucenttb')
  }

  private get executablePath(): string {
    return path.join(this.helperDirectory, 'TranslucentTB.exe')
  }

  private get archivePath(): string {
    return path.join(this.helperDirectory, 'TranslucentTB.zip')
  }

  private get settingsPath(): string {
    return path.join(this.helperDirectory, 'settings.json')
  }

  private async ensureInstalled(): Promise<IpcResponse> {
    if (this.fsModule.existsSync(this.executablePath)) {
      return { success: true }
    }

    try {
      await this.fsPromises.mkdir(this.helperDirectory, { recursive: true })
      const output = await this.execPowerShellEncoded(buildInstallScript(this.archivePath, this.helperDirectory), 180000)
      return output.includes('install-success') && this.fsModule.existsSync(this.executablePath)
        ? { success: true }
        : { success: false, error: '准备新版任务栏兼容组件失败' }
    } catch {
      return { success: false, error: '准备新版任务栏兼容组件失败' }
    }
  }

  private async isHelperRunning(): Promise<boolean> {
    const output = await this.execPowerShellEncoded(buildRunningCheckScript(this.executablePath), 30000)
    return output.includes('running:true-marker')
  }

  private async writeSettings(input: TaskbarAppearanceInput): Promise<void> {
    await this.fsPromises.mkdir(this.helperDirectory, { recursive: true })
    await this.fsPromises.writeFile(this.settingsPath, JSON.stringify(buildHelperSettings(input), null, 2))
  }

  async applyAppearance(input: TaskbarAppearanceInput): Promise<IpcResponse> {
    const installedResult = await this.ensureInstalled()
    if (!installedResult.success) {
      return installedResult
    }

    try {
      await this.writeSettings(input)
    } catch {
      return { success: false, error: '写入新版任务栏兼容配置失败' }
    }

    try {
      if (await this.isHelperRunning()) {
        return { success: true }
      }

      const child = this.spawn(this.executablePath, [], {
        cwd: this.helperDirectory,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })

      child.unref()
      return { success: true }
    } catch {
      return { success: false, error: '启动新版任务栏兼容组件失败' }
    }
  }

  async restoreDefault(): Promise<IpcResponse> {
    if (!this.fsModule.existsSync(this.executablePath)) {
      return { success: true }
    }

    try {
      const output = await this.execPowerShellEncoded(buildStopScript(this.executablePath), 30000)
      if (output && !output.includes('stop-success')) {
        return { success: false, error: '恢复默认任务栏失败' }
      }
    } catch {
      return { success: false, error: '恢复默认任务栏失败' }
    }

    try {
      await this.fsPromises.rm(this.settingsPath, { force: true })
    } catch {
      return { success: false, error: '清理新版任务栏兼容配置失败' }
    }

    return { success: true }
  }
}
