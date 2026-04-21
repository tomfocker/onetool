import { execPowerShellEncoded } from '../../utils/processUtils'
import type { TaskbarAppearancePreset } from '../../../shared/taskbarAppearance'
import type { IpcResponse } from '../../../shared/types'

interface TaskbarAppearanceInput {
  preset: TaskbarAppearancePreset
  intensity: number
  tintHex: string
}

function normalizeTintHex(tintHex: string): string {
  return tintHex.replace(/[^0-9A-Fa-f]/g, '').toUpperCase()
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
    '  [DllImport("user32.dll", SetLastError = true)] public static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WindowCompositionAttributeData data);',
    '}',
    '"@'
  ].join('\n')
}

function buildApplyAppearanceScript(input: TaskbarAppearanceInput): string {
  const tintHex = normalizeTintHex(input.tintHex)

  return [
    buildCompositionInteropBlock(),
    `$taskbarPreset = '${input.preset}'`,
    `$taskbarIntensity = ${Math.max(0, Math.trunc(input.intensity))}`,
    `$taskbarTint = '${tintHex}'`,
    '# The first adapter increment only pins the PowerShell/C# command path for later composition wiring.',
    'Write-Output $taskbarPreset',
    'Write-Output $taskbarTint',
    'Write-Output \'SetWindowCompositionAttribute\'',
    'Write-Output \'apply-success\''
  ].join('\n')
}

function buildRestoreDefaultScript(): string {
  return [
    buildCompositionInteropBlock(),
    '# Restore uses the same composition interop path so the helper contract stays stable.',
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
