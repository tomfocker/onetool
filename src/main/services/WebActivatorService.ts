import { app, BrowserWindow, globalShortcut } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { execPowerShell } from '../utils/processUtils'
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
        $browserProcs = Get-Process | Where-Object { $_.ProcessName -match "^(msedge|chrome|brave|firefox)$" -and $_.MainWindowHandle -ne 0 }
        $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
        foreach ($p in $browserProcs) {
            try {
                $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
                if ($root) {
                    $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
                    foreach ($t in $tabs) {
                        $name = $t.Current.Name
                        if ($name -and $name -notmatch "^\d+ 个标签页$|^关闭$|^新标签页$") {
                            $null = $res.Add(@{ id = $p.Id; title = $name; processName = $p.ProcessName; hwnd = $p.MainWindowHandle.ToInt64(); type = "tab" })
                        }
                    }
                }
            } catch {}
        }
        Write-Output "---TAB_JSON_START---"
        if ($res.Count -eq 0) { Write-Output "[]" } else {
            $outputList = @()
            foreach ($item in $res) {
                $obj = New-Object PSObject
                $obj | Add-Member -MemberType NoteProperty -Name "id" -Value $item.id
                $obj | Add-Member -MemberType NoteProperty -Name "title" -Value $item.title
                $obj | Add-Member -MemberType NoteProperty -Name "processName" -Value $item.processName
                $obj | Add-Member -MemberType NoteProperty -Name "hwnd" -Value $item.hwnd
                $obj | Add-Member -MemberType NoteProperty -Name "type" -Value $item.type
                $outputList += $obj
            }
            Write-Output ($outputList | ConvertTo-Json -Depth 5)
        }
        Write-Output "---TAB_JSON_END---"
      `;
      const tempDir = path.join(app.getPath('temp'), 'onetool_activator')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      const scriptPath = path.join(tempDir, 'get_tabs.ps1')
      fs.writeFileSync(scriptPath, '\ufeff' + tabScript, 'utf8')
      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true })
      processRegistry.register(ps)
      let tabResult = ''
      ps.stdout.on('data', (d) => tabResult += d.toString('utf8'))
      await new Promise(resolve => ps.on('close', resolve))
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
            $procs = Get-Process | Where-Object { ($_.MainWindowTitle -match "${escapedPattern}" -or $_.ProcessName -match "${escapedPattern}") -and $_.MainWindowHandle -ne [IntPtr]::Zero }
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
                [Win32]::ShowWindow($targetHwnd, 9) | Out-Null
                [Win32]::ShowWindow($targetHwnd, 5) | Out-Null
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
    try {
      const escapedPattern = pattern.replace(/"/g, '`"')
      const script = `
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
          }
"@
        function Select-Tab($tab) {
            $pattern = [System.Windows.Automation.SelectionItemPattern]::SelectionItemPattern
            $p = $tab.GetCurrentPattern($pattern)
            $p.Select()
        }
        $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
        $browserProcs = Get-Process | Where-Object { $_.ProcessName -match "^(msedge|chrome|brave|firefox)$" -and $_.MainWindowHandle -ne 0 }
        $targetTab = $null; $targetHwnd = [IntPtr]::Zero; $currentTab = $null; $returnTab = $null
        foreach ($p in $browserProcs) {
            try {
                $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
                if ($root) {
                    $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
                    foreach ($t in $tabs) {
                        if ($t.Current.Name -match "${escapedPattern}") { $targetTab = $t; $targetHwnd = $p.MainWindowHandle }
                        try {
                            $selPattern = [System.Windows.Automation.SelectionItemPattern]::SelectionItemPattern
                            if ($t.GetCurrentPattern($selPattern).Current.IsSelected) { $currentTab = $t }
                            else { $returnTab = $t }
                        } catch {}
                    }
                }
            } catch {}
            if ($targetTab) { break }
        }
        if ($targetTab) {
            $fgHwnd = [Win32]::GetForegroundWindow()
            if ($fgHwnd -eq $targetHwnd) {
                if ($currentTab -and $currentTab.Current.Name -match "${escapedPattern}") {
                    if ($returnTab) { Select-Tab($returnTab) | Out-Null; "ACTION:RETURN|NAME:" + $returnTab.Current.Name }
                    else { "ACTION:ALREADY_HERE" }
                } else {
                    $oldName = if ($currentTab) { $currentTab.Current.Name } else { "" }
                    Select-Tab($targetTab) | Out-Null; "ACTION:SWITCH|NAME:" + $oldName
                }
            } else {
                if ([Win32]::IsIconic($targetHwnd)) { [Win32]::ShowWindow($targetHwnd, 9) | Out-Null }
                [Win32]::ShowWindow($targetHwnd, 5) | Out-Null; [Win32]::SetForegroundWindow($targetHwnd) | Out-Null
                Start-Sleep -Milliseconds 80; Select-Tab($targetTab) | Out-Null; "ACTION:ACTIVATE|NAME:" + (if ($currentTab) { $currentTab.Current.Name } else { "" })
            }
        } else { "NOT_FOUND" }
      `;
      const tempDir = path.join(app.getPath('temp'), 'onetool_activator')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      const scriptPath = path.join(tempDir, 'toggle_tab.ps1')
      fs.writeFileSync(scriptPath, '\ufeff' + script, 'utf8')
      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true })
      processRegistry.register(ps)
      let result = ''
      ps.stdout.on('data', (d) => result += d.toString('utf8'))
      await new Promise(resolve => ps.on('close', resolve))
      if (result.includes('ACTION:SWITCH') || result.includes('ACTION:ACTIVATE')) return { success: true, action: 'activated' }
      if (result.includes('ACTION:RETURN')) return { success: true, action: 'minimized' }
      return { success: false, error: 'Tab not found' }
    } catch (e) { return { success: false, error: (e as Error).message } }
  }

  async checkVisibility(configs: Array<{ type: 'app' | 'tab'; pattern: string; hwnd?: number }>): Promise<IpcResponse<{ results: boolean[] }>> {
    const results = await Promise.all(configs.map(async (config) => {
      const escapedPattern = config.pattern.replace(/"/g, '`"')
      const script = `
        Add-Type @"
          using System;
          using System.Text;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
            [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
            public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
            [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
            [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
          }
"@
        $targetHwnd = [IntPtr]::Zero
        if ("${config.type}" -eq "app") {
            if ("${config.hwnd || 0}" -ne "0") {
                $h = [IntPtr]${config.hwnd || 0}
                if ([Win32]::IsWindow($h)) { $targetHwnd = $h }
            }
            if ($targetHwnd -eq [IntPtr]::Zero) {
                $proc = Get-Process | Where-Object { ($_.MainWindowTitle -match "${escapedPattern}" -or $_.ProcessName -match "${escapedPattern}") -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
                if ($proc) { $targetHwnd = $proc.MainWindowHandle }
            }
        } else {
            [Win32]::EnumWindows({
                param($h, $l)
                if ([Win32]::IsWindowVisible($h)) {
                    $sb = New-Object System.Text.StringBuilder 256
                    [Win32]::GetWindowText($h, $sb, $sb.Capacity) | Out-Null
                    if ($sb.ToString() -match "${escapedPattern}") { $targetHwnd = $h; return $false }
                }
                return $true
            }, [IntPtr]::Zero) | Out-Null
        }
        if ($targetHwnd -ne [IntPtr]::Zero) {
            $fgHwnd = [Win32]::GetForegroundWindow(); $fgRoot = [Win32]::GetAncestor($fgHwnd, 2); $targetRoot = [Win32]::GetAncestor($targetHwnd, 2)
            $isActive = ($fgHwnd -eq $targetHwnd -or $fgRoot -eq $targetRoot -or $fgRoot -eq $targetHwnd) -and -not [Win32]::IsIconic($targetHwnd)
            if ($isActive) { "active" } else { "inactive" }
        } else { "not_found" }
      `
      const result = await execPowerShell(script)
      return result.trim() === 'active'
    }))
    return { success: true, data: { results } }
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
