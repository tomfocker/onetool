import { execPowerShellEncoded } from '../../utils/processUtils'
import type { TaskbarAppearancePreset } from '../../../shared/taskbarAppearance'
import type { IpcResponse } from '../../../shared/types'

interface TaskbarAppearanceInput {
  preset: TaskbarAppearancePreset
  intensity: number
  tintHex: string
}

function normalizeTintHex(tintHex: string): string {
  const sanitized = tintHex.replace(/[^0-9A-Fa-f]/g, '').toUpperCase()

  if (sanitized.length >= 8) {
    return sanitized.slice(0, 8)
  }

  if (sanitized.length >= 6) {
    return `${sanitized.slice(0, 6)}FF`
  }

  return 'FFFFFF33'
}

function toGradientColorHex(tintHex: string): string {
  const normalized = normalizeTintHex(tintHex)
  const red = normalized.slice(0, 2)
  const green = normalized.slice(2, 4)
  const blue = normalized.slice(4, 6)
  const alpha = normalized.slice(6, 8)

  return `${alpha}${blue}${green}${red}`
}

function toIntensityAdjustedGradientColorHex(input: TaskbarAppearanceInput): string {
  const normalized = normalizeTintHex(input.tintHex)
  const red = normalized.slice(0, 2)
  const green = normalized.slice(2, 4)
  const blue = normalized.slice(4, 6)
  const alpha = normalized.slice(6, 8)
  const baseAlpha = Number.parseInt(alpha, 16)
  const clampedIntensity = Math.max(0, Math.min(100, Math.trunc(input.intensity)))
  const effectiveAlpha = Math.round((baseAlpha * clampedIntensity) / 100)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()

  return `${effectiveAlpha}${blue}${green}${red}`
}

function getAccentState(preset: TaskbarAppearancePreset): number {
  switch (preset) {
    case 'transparent':
      return 2
    case 'blur':
      return 3
    case 'acrylic':
      return 4
    case 'default':
    default:
      return 0
  }
}

function buildCompositionInteropBlock(): string {
  return [
    '$ErrorActionPreference = \'Stop\'',
    'Add-Type -Language CSharp -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct AccentPolicy {',
    '  public int AccentState;',
    '  public int AccentFlags;',
    '  public int GradientColor;',
    '  public int AnimationId;',
    '}',
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct WindowCompositionAttributeData {',
    '  public int Attribute;',
    '  public IntPtr Data;',
    '  public int SizeOfData;',
    '}',
    'public static class AccentInterop {',
    '  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);',
    '  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);',
    '  [DllImport("user32.dll", SetLastError = true)] public static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WindowCompositionAttributeData data);',
    '}',
    '"@'
  ].join('\n')
}

function buildApplyAppearanceScript(input: TaskbarAppearanceInput): string {
  const tintHex = normalizeTintHex(input.tintHex)
  const gradientColorHex = toIntensityAdjustedGradientColorHex(input)
  const accentState = getAccentState(input.preset)

  return [
    buildCompositionInteropBlock(),
    `$taskbarPreset = '${input.preset}'`,
    `$taskbarIntensity = ${Math.max(0, Math.trunc(input.intensity))}`,
    `$taskbarTint = '${tintHex}'`,
    `$gradientColorHex = '${gradientColorHex}'`,
    `$gradientColorValue = 0x${gradientColorHex}`,
    '$taskbarHandles = New-Object System.Collections.Generic.List[IntPtr]',
    '$primaryTaskbarHandle = [AccentInterop]::FindWindow(\'Shell_TrayWnd\', $null)',
    'if ($primaryTaskbarHandle -ne [IntPtr]::Zero) { [void] $taskbarHandles.Add($primaryTaskbarHandle) }',
    '$secondaryTaskbarHandle = [IntPtr]::Zero',
    'while ($true) {',
    '  $secondaryTaskbarHandle = [AccentInterop]::FindWindowEx([IntPtr]::Zero, $secondaryTaskbarHandle, \'Shell_SecondaryTrayWnd\', $null)',
    '  if ($secondaryTaskbarHandle -eq [IntPtr]::Zero) { break }',
    '  [void] $taskbarHandles.Add($secondaryTaskbarHandle)',
    '}',
    'if ($taskbarHandles.Count -eq 0) { throw \'Taskbar handle not found\' }',
    '$accent = New-Object AccentPolicy',
    `$accent.AccentState = ${accentState}`,
    '$accent.AccentFlags = 0',
    '$accent.GradientColor = [int] $gradientColorValue',
    '$accent.AnimationId = 0',
    '$accentSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type] [AccentPolicy])',
    '$accentPtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($accentSize)',
    '[System.Runtime.InteropServices.Marshal]::StructureToPtr($accent, $accentPtr, $false)',
    '$data = New-Object WindowCompositionAttributeData',
    '$data.Attribute = 19',
    '$data.Data = $accentPtr',
    '$data.SizeOfData = $accentSize',
    'try {',
    '  foreach ($taskbarHandle in $taskbarHandles) {',
    '    $result = [AccentInterop]::SetWindowCompositionAttribute($taskbarHandle, [ref] $data)',
    '    if ($result -eq 0) { throw \'SetWindowCompositionAttribute failed\' }',
    '  }',
    '} finally {',
    '  [System.Runtime.InteropServices.Marshal]::FreeHGlobal($accentPtr)',
    '}',
    'Write-Output $taskbarPreset',
    'Write-Output $taskbarTint',
    'Write-Output $gradientColorHex',
    'Write-Output \'SetWindowCompositionAttribute\'',
    'Write-Output \'apply-success\''
  ].join('\n')
}

function buildRestoreDefaultScript(): string {
  return [
    buildCompositionInteropBlock(),
    '$taskbarHandles = New-Object System.Collections.Generic.List[IntPtr]',
    '$primaryTaskbarHandle = [AccentInterop]::FindWindow(\'Shell_TrayWnd\', $null)',
    'if ($primaryTaskbarHandle -ne [IntPtr]::Zero) { [void] $taskbarHandles.Add($primaryTaskbarHandle) }',
    '$secondaryTaskbarHandle = [IntPtr]::Zero',
    'while ($true) {',
    '  $secondaryTaskbarHandle = [AccentInterop]::FindWindowEx([IntPtr]::Zero, $secondaryTaskbarHandle, \'Shell_SecondaryTrayWnd\', $null)',
    '  if ($secondaryTaskbarHandle -eq [IntPtr]::Zero) { break }',
    '  [void] $taskbarHandles.Add($secondaryTaskbarHandle)',
    '}',
    'if ($taskbarHandles.Count -eq 0) { throw \'Taskbar handle not found\' }',
    '$accent = New-Object AccentPolicy',
    '$accent.AccentState = 0',
    '$accent.AccentFlags = 0',
    '$accent.GradientColor = 0',
    '$accent.AnimationId = 0',
    '$accentSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type] [AccentPolicy])',
    '$accentPtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($accentSize)',
    '[System.Runtime.InteropServices.Marshal]::StructureToPtr($accent, $accentPtr, $false)',
    '$data = New-Object WindowCompositionAttributeData',
    '$data.Attribute = 19',
    '$data.Data = $accentPtr',
    '$data.SizeOfData = $accentSize',
    'try {',
    '  foreach ($taskbarHandle in $taskbarHandles) {',
    '    $result = [AccentInterop]::SetWindowCompositionAttribute($taskbarHandle, [ref] $data)',
    '    if ($result -eq 0) { throw \'SetWindowCompositionAttribute failed\' }',
    '  }',
    '} finally {',
    '  [System.Runtime.InteropServices.Marshal]::FreeHGlobal($accentPtr)',
    '}',
    'Write-Output \'restore-default\'',
    'Write-Output \'SetWindowCompositionAttribute\'',
    'Write-Output \'restore-success\''
  ].join('\n')
}

export class WindowsTaskbarAdapter {
  async applyAppearance(input: TaskbarAppearanceInput): Promise<IpcResponse> {
    try {
      const output = await execPowerShellEncoded(buildApplyAppearanceScript(input))
      return output.includes('apply-success')
        ? { success: true }
        : { success: false, error: '任务栏样式应用失败' }
    } catch {
      return { success: false, error: '任务栏样式应用失败' }
    }
  }

  async restoreDefault(): Promise<IpcResponse> {
    try {
      const output = await execPowerShellEncoded(buildRestoreDefaultScript())
      return output.includes('restore-success')
        ? { success: true }
        : { success: false, error: '任务栏样式恢复失败' }
    } catch {
      return { success: false, error: '任务栏样式恢复失败' }
    }
  }
}
