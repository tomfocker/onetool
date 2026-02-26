const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/main/index.ts');
const content = fs.readFileSync(filePath, 'utf8');

const newGetListCode = `ipcMain.handle('web-activator-get-window-list', async () => {
  const allResults: any[] = [];
  try {
    const winScript = \`Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object { @{ id = $_.Id; title = $_.MainWindowTitle; processName = $_.ProcessName; hwnd = $_.MainWindowHandle.ToInt64(); type = 'window' } } | ConvertTo-Json -Compress\`;
    const winResult = await execPowerShell(winScript);
    if (winResult) {
      const parsed = JSON.parse(winResult);
      allResults.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    }
  } catch (e) {}

  try {
    const tabScript = \`
      $ErrorActionPreference = 'SilentlyContinue'
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes
      $res = New-Object System.Collections.ArrayList
      $edgeProcs = Get-Process -Name "msedge" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
      foreach ($p in $edgeProcs) {
          try {
              $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
              $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
              foreach ($el in $all) {
                  if ($el.Current.ControlType.Id -eq 50019) {
                      $name = $el.Current.Name
                      if ($name -and $name -notmatch "^\\\\d+ 个标签页$|^关闭$|^新标签页$") {
                          $null = $res.Add(@{ id = $p.Id; title = $name; processName = "msedge"; hwnd = $p.MainWindowHandle.ToInt64(); type = "tab" })
                      }
                  }
              }
          } catch {}
      }
      $res | ConvertTo-Json -Compress
    \`;
    const tabResult = await execPowerShell(tabScript);
    const jsonStart = tabResult.lastIndexOf('[');
    const jsonEnd = tabResult.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(tabResult.substring(jsonStart, jsonEnd + 1));
        allResults.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    }
  } catch (e) {}

  const unique = new Map();
  allResults.forEach(w => {
    if (w.title && w.title.trim()) {
      const key = w.type + "-" + w.processName + "-" + w.title;
      if (!unique.has(key)) unique.set(key, w);
    }
  });
  return { success: true, windows: Array.from(unique.values()) };
})`;

const newToggleTabCode = `async function toggleTab(pattern: string): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    const escapedPattern = pattern.replace(/"/g, '\`"');
    const script = \`
      $ErrorActionPreference = 'SilentlyContinue'
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes
      $edgeProcs = Get-Process -Name "msedge" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
      $targetTab = $null
      foreach ($p in $edgeProcs) {
          $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
          $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
          foreach ($el in $all) {
              if ($el.Current.ControlType.Id -eq 50019 -and $el.Current.Name -match "\${escapedPattern}") {
                  $targetTab = $el; $parentHwnd = $p.MainWindowHandle; $procId = $p.Id; break
              }
          }
          if ($targetTab) { break }
      }
      if ($targetTab) {
          $wshell = New-Object -ComObject WScript.Shell
          $wshell.AppActivate($procId)
          Start-Sleep -Milliseconds 50
          $selectionPattern = $null
          if ($targetTab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selectionPattern)) {
              if ($selectionPattern.Current.IsSelected) {
                  $type = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);' -Name "Win32Toggle" -PassThru
                  [Win32Toggle]::ShowWindow($parentHwnd, 6) | Out-Null
                  "minimized"
              } else {
                  $selectionPattern.Select()
                  "activated"
              }
          } else { "activated" }
      } else { "not_found" }
    \`;
    const result = await execPowerShell(script);
    if (result.includes('activated')) return { success: true, action: 'activated' };
    if (result.includes('minimized')) return { success: true, action: 'minimized' };
    return { success: false, error: '未找到匹配的标签页' };
  } catch (error) { return { success: false, error: (error as Error).message }; }
}`;

const startGetIndex = content.indexOf('ipcMain.handle(\'web-activator-get-window-list\'');
const nextAfterGetIndex = content.indexOf('async function toggleApp', startGetIndex);
const updatedWithGet = content.substring(0, startGetIndex) + newGetListCode + "\n\n" + content.substring(nextAfterGetIndex);

const startToggleIndex = updatedWithGet.indexOf('async function toggleTab');
const nextAfterToggleIndex = updatedWithGet.indexOf('let webActivatorShortcuts', startToggleIndex);
const finalContent = updatedWithGet.substring(0, startToggleIndex) + newToggleTabCode + "\n\n" + updatedWithGet.substring(nextAfterToggleIndex);

fs.writeFileSync(filePath, finalContent);
console.log('Final Polish Applied. Tab switching synced with detection.');
