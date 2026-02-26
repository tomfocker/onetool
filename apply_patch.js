const fs = require('fs');
const filePath = 'src/main/index.ts';
let content = fs.readFileSync(filePath, 'utf8');

const newCode = `async function toggleApp(pattern: string, hwndId?: number): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
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
        }
"@
      $targetProc = $null
      if ("\${hwndId || 0}" -ne "0") {
          $h = [IntPtr]\${hwndId || 0}
          if ([Win32]::IsWindow($h)) {
              [uint32]$pId = 0
              [Win32]::GetWindowThreadProcessId($h, [ref]$pId)
              $targetProc = Get-Process -Id $pId -ErrorAction SilentlyContinue
          }
      }
      if (!$targetProc) {
          $targetProc = Get-Process | Where-Object { ($_.MainWindowTitle -match "\${pattern}" -or $_.ProcessName -match "\${pattern}") -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
      }

      if ($targetProc) {
          $hwnd = $targetProc.MainWindowHandle
          $fgHwnd = [Win32]::GetForegroundWindow()
          [uint32]$fgPid = 0
          [Win32]::GetWindowThreadProcessId($fgHwnd, [ref]$fgPid)

          if ($fgPid -eq $targetProc.Id) {
              [Win32]::ShowWindow($hwnd, 6) | Out-Null
              "minimized"
          } else {
              [Win32]::ShowWindow($hwnd, 9) | Out-Null
              [Win32]::SetForegroundWindow($hwnd) | Out-Null
              "activated"
          }
      } else { "not_found" }
    `
    const result = await execPowerShell(script)
    if (result.includes('activated')) return { success: true, action: 'activated' }
    if (result.includes('minimized')) return { success: true, action: 'minimized' }
    return { success: false, error: '未找到匹配的窗口' }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

let webActivatorShortcuts: string[] = [];

ipcMain.handle('web-activator-toggle-window', async (_event, config: { type: 'app' | 'tab', pattern: string, id?: number }) => {
  if (config.type === 'app') return await toggleApp(config.pattern, config.id)
  return await toggleTab(config.pattern)
})

ipcMain.handle('web-activator-register-shortcuts', async (_event, configs: Array<{ id: string; type: 'app' | 'tab'; pattern: string; shortcut: string; hwnd?: number }>) => {
  try {
    globalShortcut.unregisterAll()
    webActivatorShortcuts = []
    
    let successCount = 0
    for (const config of configs) {
      if (!config.shortcut || config.shortcut === 'Alt+' || config.shortcut.endsWith('+')) continue
      
      const success = globalShortcut.register(config.shortcut, async () => {
        const result = config.type === 'app' ? await toggleApp(config.pattern, config.hwnd) : await toggleTab(config.pattern)
        if (mainWindow && result.success) {
          mainWindow.webContents.send('web-activator-shortcut-triggered', {
            id: config.id,
            action: result.action
          })
        }
      })
      if (success) {
        webActivatorShortcuts.push(config.shortcut)
        successCount++
      }
    }
    return { success: true }
  } catch (error) {
    console.error('Register shortcuts error:', error)
    return { success: false, error: (error as Error).message }
  }
})`;

// 查找 toggleApp 函数的起始位置
const startIndex = content.indexOf('async function toggleApp');
// 查找该段逻辑结束后的下一个函数或 Tray 定义的起始位置
const endIndex = content.indexOf('function createTray(): void {');

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex) + newCode + '

' + content.substring(endIndex);
    fs.writeFileSync(filePath, newContent);
    console.log('Patch applied successfully!');
} else {
    console.error('Could not find anchor points for patch', {startIndex, endIndex});
}
