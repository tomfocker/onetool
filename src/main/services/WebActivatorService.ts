import { app, BrowserWindow, globalShortcut } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { execPowerShell, execPowerShellEncoded } from '../utils/processUtils'
import { IpcResponse } from '../../shared/types'
import { processRegistry } from './ProcessRegistry'

export class WebActivatorService {
  private mainWindow: BrowserWindow | null = null
  private shortcuts = new Set<string>()

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  async getWindowList(): Promise<IpcResponse<{ windows: any[] }>> {
    const allResults: any[] = [];
    try {
      const winScript = `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object { @{ id = $_.Id; title = $_.MainWindowTitle; processName = $_.ProcessName; hwnd = $_.MainWindowHandle.ToInt64(); type = 'window' } } | ConvertTo-Json -Compress`;
      const winResult = await execPowerShell(winScript);
      if (winResult) {
        const parsed = JSON.parse(winResult);
        allResults.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      }
    } catch (e) { }

    try {
      const tabScript = `
        $ErrorActionPreference = 'SilentlyContinue'
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes
        $res = New-Object System.Collections.ArrayList
        $browserProcs = Get-Process | Where-Object { $_.ProcessName -match "^(msedge|chrome|brave|firefox|thor)$" -and $_.MainWindowHandle -ne 0 }
        $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
        foreach ($p in $browserProcs) {
            try {
                $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
                if ($root) {
                    $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
                    foreach ($t in $tabs) {
                        $name = $t.Current.Name
                        if ($name -and $name -notmatch "^\\d+ 个标签页$|^关闭$|^新标签页$") {
                            $null = $res.Add(@{ id = $p.Id; title = $name; processName = $p.ProcessName; hwnd = $p.MainWindowHandle.ToInt64(); type = "tab" })
                        }
                    }
                }
            } catch {}
        }
        Write-Output "---TAB_JSON_START---"
        if ($res.Count -eq 0) {
            Write-Output "[]"
        } else {
            $outputList = New-Object System.Collections.ArrayList
            foreach ($item in $res) {
                $obj = New-Object PSObject -Property @{
                    id = $item.id
                    title = $item.title
                    processName = $item.processName
                    hwnd = $item.hwnd
                    type = $item.type
                }
                $null = $outputList.Add($obj)
            }
            Write-Output ($outputList | ConvertTo-Json -Depth 5 -Compress)
        }
        Write-Output "---TAB_JSON_END---"
      `;
      const tabResult = await execPowerShellEncoded(tabScript, 10000);
      const match = tabResult.match(/---TAB_JSON_START---\s*(.*?)\s*---TAB_JSON_END---/s);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1].trim());
          allResults.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        } catch (e) { console.error('WebActivatorService: Tab JSON Parse Error:', e); }
      }
    } catch (e) { }

    const unique = new Map();
    allResults.forEach(w => {
      if (w.title && w.title.trim()) {
        const key = w.type + "-" + w.processName + "-" + w.title;
        if (!unique.has(key)) unique.set(key, w);
      }
    });
    return { success: true, data: { windows: Array.from(unique.values()) } };
  }

  async toggleApp(pattern: string, hwndId?: number): Promise<{ success: boolean; action?: string; error?: string }> {
    try {
      const escapedPattern = pattern.replace(/"/g, '`"')
      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
            [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
          }
"@
        $proc = $null
        $targetHwnd = [IntPtr]::Zero
        if ("${hwndId || 0}" -ne "0") {
            $h = [IntPtr]${hwndId || 0}
            if ([Win32]::IsWindow($h)) {
                $targetHwnd = $h
                [uint32]$pId = 0
                [Win32]::GetWindowThreadProcessId($h, [ref]$pId)
                $proc = Get-Process -Id $pId -ErrorAction SilentlyContinue
            }
        }
        if (!$proc -or $targetHwnd -eq [IntPtr]::Zero) {
            $procs = Get-Process | Where-Object { ($_.MainWindowTitle -match [regex]::Escape("${escapedPattern}") -or $_.ProcessName -match [regex]::Escape("${escapedPattern}")) -and $_.MainWindowHandle -ne [IntPtr]::Zero }
            $proc = $procs | Select-Object -First 1
            if ($proc) { $targetHwnd = $proc.MainWindowHandle }
        }
        if ($targetHwnd -ne [IntPtr]::Zero) {
            $fgHwnd = [Win32]::GetForegroundWindow()
            $fgRoot = [Win32]::GetAncestor($fgHwnd, 2)
            $targetRoot = [Win32]::GetAncestor($targetHwnd, 2)
            if (($fgHwnd -eq $targetHwnd -or $fgRoot -eq $targetRoot -or $fgRoot -eq $targetHwnd) -and -not [Win32]::IsIconic($targetHwnd)) {
                [Win32]::ShowWindow($targetHwnd, 6) | Out-Null
                "minimized"
            } else {
                if ([Win32]::IsIconic($targetHwnd)) { [Win32]::ShowWindow($targetHwnd, 9) | Out-Null }
                else { [Win32]::ShowWindow($targetHwnd, 5) | Out-Null }
                [Win32]::SetForegroundWindow($targetHwnd) | Out-Null
                "activated"
            }
        } else { "not_found" }
      `
      const result = await execPowerShell(script)
      if (result.includes('activated')) return { success: true, action: 'activated' }
      if (result.includes('minimized')) return { success: true, action: 'minimized' }
      return { success: false, error: 'Target not found' }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async toggleTab(pattern: string): Promise<{ success: boolean; action?: string; error?: string }> {
    const configBase64 = Buffer.from(JSON.stringify({ pattern })).toString('base64');
    try {
      const script = `
        $ErrorActionPreference = 'SilentlyContinue'
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
          }
"@
        function Select-Tab($tab) {
            try {
                $patt = [System.Windows.Automation.SelectionItemPattern]::SelectionItemPattern
                $p = $tab.GetCurrentPattern($patt)
                if ($p) { $p.Select() }
            } catch {}
        }

        $jsonRaw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${configBase64}"))
        $cfgData = $jsonRaw | ConvertFrom-Json
        $targetName = $cfgData.pattern

        $browserNameRegex = "^(msedge|chrome|brave|firefox|360chrome|sogouexplorer|vivaldi|opera|yandex|thor)$"
        $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)

        function Find-And-Activate {
            $procs = Get-Process | Where-Object { $_.ProcessName -match $browserNameRegex }
            $hnds = @()
            foreach ($p in $procs) {
                if ($p.MainWindowHandle -ne 0) { $hnds += $p.MainWindowHandle }
                # 某些窗口可能不在 MainWindowHandle 中
                try {
                    $allWins = Get-Process -Id $p.Id | Select-Object -ExpandProperty MainWindowHandle -ErrorAction SilentlyContinue
                    $hnds += $allWins
                } catch {}
            }
            $hnds = $hnds | Where-Object { $_ -ne 0 } | Select-Object -Unique

            foreach ($hwnd in $hnds) {
                if (-not [Win32]::IsWindow($hwnd)) { continue }
                
                # 特殊逻辑：如果窗口标题直接包含 pattern，且该窗口已经在前台，直接成功
                $fg = [Win32]::GetForegroundWindow()
                if ($fg -eq $hwnd) {
                   try {
                     $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
                     if ($root.Current.Name -match [regex]::Escape($targetName)) { return "ALREADY_ACTIVE" }
                   } catch {}
                }

                try {
                    $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
                    # 深度搜索：不限制路径，因为 Edge 的布局版本差异太大
                    $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
                    foreach ($t in $tabs) {
                        if ($t.Current.Name -match [regex]::Escape($targetName)) {
                            # 找到了！
                            if ([Win32]::IsIconic($hwnd)) { [Win32]::ShowWindow($hwnd, 9) | Out-Null }
                            Select-Tab($t) | Out-Null
                            [Win32]::SetForegroundWindow($hwnd) | Out-Null
                            return "SUCCESS"
                        }
                    }
                } catch {}
            }
            return $null
        }

        # 尝试第一次搜索
        $res = Find-And-Activate
        if ($res) { 
            Write-Output "ACTION:ACTIVATE"
            exit 
        }

        # 如果没找到，尝试“最后通牒”：还原所有的浏览器窗口再搜一次
        $procs = Get-Process | Where-Object { $_.ProcessName -match $browserNameRegex }
        foreach ($p in $procs) {
            if ($p.MainWindowHandle -ne 0) {
                [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
                [Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
            }
        }
        Start-Sleep -Milliseconds 600
        $res = Find-And-Activate
        
        if ($res) { Write-Output "ACTION:ACTIVATE" }
        else { Write-Output "NOT_FOUND" }
      `;
      const result = await execPowerShellEncoded(script, 15000);
      if (result.includes('ACTION:ACTIVATE') || result.includes('ALREADY_ACTIVE')) return { success: true, action: 'activated' }
      return { success: false, error: 'Tab not found' }
    } catch (e) { return { success: false, error: (e as Error).message } }
  }

  async checkVisibility(configs: Array<{ type: 'app' | 'tab'; pattern: string; hwnd?: number }>): Promise<IpcResponse<{ results: boolean[] }>> {
    const configBase64 = Buffer.from(JSON.stringify(configs)).toString('base64');
    const script = `
      Add-Type @"
        using System;
        using System.Text;
        using System.Runtime.InteropServices;
        public class Win32V {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
          [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
        }
"@
      $configJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${configBase64}"))
      $cfgs = $configJson | ConvertFrom-Json
      $results = @()
      $fgHwnd = [Win32V]::GetForegroundWindow()
      $fgRoot = [Win32V]::GetAncestor($fgHwnd, 2)
      $sb = New-Object System.Text.StringBuilder 512
      [Win32V]::GetWindowText($fgHwnd, $sb, $sb.Capacity) | Out-Null
      $fgTitle = $sb.ToString()

      foreach ($cfg in $cfgs) {
          $isActive = $false
          if ($cfg.type -eq "app") {
              $targetHwnd = [IntPtr]::Zero
              if ($cfg.hwnd -ne 0) {
                  $h = [IntPtr]$cfg.hwnd
                  if ([Win32V]::IsWindow($h)) { $targetHwnd = $h }
              }
              if ($targetHwnd -eq [IntPtr]::Zero) {
                  $pattern = $cfg.pattern -replace "'", "''"
                  $proc = Get-Process | Where-Object { ($_.MainWindowTitle -match [regex]::Escape($pattern) -or $_.ProcessName -match [regex]::Escape($pattern)) -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
                  if ($proc) { $targetHwnd = $proc.MainWindowHandle }
              }
              if ($targetHwnd -ne [IntPtr]::Zero) {
                  $targetRoot = [Win32V]::GetAncestor($targetHwnd, 2)
                  $isActive = ($fgHwnd -eq $targetHwnd -or $fgRoot -eq $targetRoot -or $fgRoot -eq $targetHwnd) -and -not [Win32V]::IsIconic($targetHwnd)
              }
          } else {
              $pattern = $cfg.pattern -replace "'", "''"
              $browserProc = Get-Process | Where-Object { $_.ProcessName -match "^(msedge|chrome|brave|firefox|360chrome|sogouexplorer|vivaldi|opera|yandex)$" -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Where-Object {
                  ($_.MainWindowTitle -match [regex]::Escape($pattern))
              } | Select-Object -First 1
              if ($browserProc) {
                  $bHwnd = $browserProc.MainWindowHandle
                  $bRoot = [Win32V]::GetAncestor($bHwnd, 2)
                  $isActive = ($fgHwnd -eq $bHwnd -or $fgRoot -eq $bRoot) -and -not [Win32V]::IsIconic($bHwnd)
              }
          }
          $results += if ($isActive) { "true" } else { "false" }
      }
      $results -join ","
    `;
    try {
      const output = await execPowerShellEncoded(script, 8000)
      const parts = output.trim().split(',')
      const results = configs.map((_, i) => parts[i]?.trim() === 'true')
      return { success: true, data: { results } }
    } catch (e) {
      return { success: true, data: { results: configs.map(() => false) } }
    }
  }

  async registerShortcuts(configs: Array<{ id: string; type: 'app' | 'tab'; pattern: string; shortcut: string; hwnd?: number }>): Promise<IpcResponse<{ registeredCount: number }>> {
    try {
      this.shortcuts.forEach(s => globalShortcut.unregister(s))
      this.shortcuts.clear()
      let successCount = 0
      for (const config of configs) {
        if (!config.shortcut || config.shortcut.endsWith('+') || config.shortcut === 'Alt') continue
        const normalizedShortcut = config.shortcut.replace('Ctrl', 'CommandOrControl')
        const success = globalShortcut.register(normalizedShortcut, async () => {
          const result = config.type === 'app' ? await this.toggleApp(config.pattern, config.hwnd) : await this.toggleTab(config.pattern)
          if (this.mainWindow) {
            this.mainWindow.webContents.send('web-activator-shortcut-triggered', { id: config.id, action: result.success ? result.action : 'not_found' })
          }
        })
        if (success) { this.shortcuts.add(normalizedShortcut); successCount++ }
      }
      return { success: true, data: { registeredCount: successCount } }
    } catch (error) { return { success: false, error: (error as Error).message } }
  }
}

export const webActivatorService = new WebActivatorService()
