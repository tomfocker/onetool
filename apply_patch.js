const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/main/index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. 更新 web-activator-get-window-list
const getWindowListCode = `ipcMain.handle('web-activator-get-window-list', async () => {
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
      
      $browserProcs = Get-Process | Where-Object { $_.ProcessName -match "^(msedge|chrome|brave|firefox)$" -and $_.MainWindowHandle -ne 0 }
      $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlTypes]::TabItem)

      foreach ($p in $browserProcs) {
          try {
              $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
              if ($root) {
                  $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
                  foreach ($t in $tabs) {
                      $name = $t.Current.Name
                      if ($name -and $name -notmatch "^\\\\d+ 个标签页$|^关闭$|^新标签页$") {
                          $null = $res.Add(@{ id = $p.Id; title = $name; processName = $p.ProcessName; hwnd = $p.MainWindowHandle.ToInt64(); type = "tab" })
                      }
                  }
              }
          } catch {}
      }
      
      # [终极修复]：使用强标记包裹 JSON，并强制处理数组格式，避免被网页标题里的中括号干扰
      Write-Output "---TAB_JSON_START---"
      if ($res.Count -eq 0) {
          Write-Output "[]"
      } elseif ($res.Count -eq 1) {
          Write-Output "[$($res[0] | ConvertTo-Json -Compress)]"
      } else {
          Write-Output ($res | ConvertTo-Json -Compress)
      }
      Write-Output "---TAB_JSON_END---"
    \`;
    
    const tabResult = await execPowerShell(tabScript);
    
    // 用正则精准提取标记中间的内容，免疫任何特殊符号
    const match = tabResult.match(/---TAB_JSON_START---\\s*(.*?)\\s*---TAB_JSON_END---/s);
    if (match && match[1]) {
        try {
            const parsed = JSON.parse(match[1].trim());
            allResults.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        } catch (e) {
            console.error('Tab JSON Parse Error:', e);
        }
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

const startGetWindowList = content.indexOf("ipcMain.handle('web-activator-get-window-list'");
if (startGetWindowList !== -1) {
    const endGetWindowList = content.indexOf('})', startGetWindowList) + 2;
    content = content.substring(0, startGetWindowList) + getWindowListCode + content.substring(endGetWindowList);
}

// 2. 更新 toggleTab 和 tabHistory
const toggleTabCode = `// 记录每个窗口上一次活跃的标签页，用于回跳逻辑
const tabHistory = new Map();

async function toggleTab(pattern: string): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    // 处理 JS 层的单引号，防止破坏 PowerShell 字符串包裹
    const safePattern = pattern.replace(/'/g, "''");
    const lastTabName = tabHistory.get(pattern) || "";
    const safeLastTabName = lastTabName.replace(/'/g, "''");

    const script = \`
      $ErrorActionPreference = 'SilentlyContinue'
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes
      
      if (!([PSObject].Assembly.GetType('Win32'))) {
          Add-Type -TypeDefinition @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
                [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
                [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
            }
"@
      }

      function Select-Tab($t) {
          if (!$t) { return $false }
          $selPattern = $null
          if ($t.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selPattern)) {
              try { $selPattern.Select(); return $true } catch {}
          }
          $invPattern = $null
          if ($t.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invPattern)) {
              try { $invPattern.Invoke(); return $true } catch {}
          }
          $legPattern = $null
          if ($t.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$legPattern)) {
              try { $legPattern.DoDefaultAction(); return $true } catch {}
          }
          return $false
      }

      # 安全获取目标浏览器进程
      $procs = Get-Process | Where-Object { $_.ProcessName -match "^(msedge|chrome|brave|firefox)$" -and $_.MainWindowHandle -ne 0 }
      
      if (!$procs) { "NOT_RUNNING"; exit }

      $targetTab = $null
      $currentTab = $null
      $returnTab = $null
      $targetHwnd = [IntPtr]::Zero

      # [修复2]：使用 [regex]::Escape 彻底免疫特殊字符（如括号）导致的解析崩溃
      $escapedPattern = [regex]::Escape('\${safePattern}')
      $escapedLastTab = if ('\${safeLastTabName}') { [regex]::Escape('\${safeLastTabName}') } else { "" }

      $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlTypes]::TabItem)
      
      # 遍历所有进程窗口寻找目标标签
      foreach ($p in $procs) {
          $hwnd = $p.MainWindowHandle
          $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
          $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
          
          foreach ($t in $tabs) {
              $name = $t.Current.Name
              if ($name -match $escapedPattern) { 
                  $targetTab = $t 
                  $targetHwnd = $hwnd
              }
              if ($escapedLastTab -and $name -match $escapedLastTab) { 
                  $returnTab = $t 
              }
              
              $selPattern = $null
              if ($t.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selPattern)) {
                  if ($selPattern.Current.IsSelected) { $currentTab = $t }
              }
          }
          # 如果找到了目标，跳出进程循环以提升执行速度
          if ($targetTab) { break }
      }

      if ($targetTab) {
          $fgHwnd = [Win32]::GetForegroundWindow()
          
          if ($fgHwnd -eq $targetHwnd) {
              # [状态机 - 回跳]：浏览器在前台
              if ($currentTab -and $currentTab.Current.Name -match $escapedPattern) {
                  if ($returnTab) {
                      Select-Tab($returnTab) | Out-Null
                      "ACTION:RETURN|NAME:" + $returnTab.Current.Name
                  } else { "ACTION:ALREADY_HERE" }
              } else {
                  # [状态机 - 切去]：浏览器在前台，但不在目标标签
                  $oldName = if ($currentTab) { $currentTab.Current.Name } else { "" }
                  Select-Tab($targetTab) | Out-Null
                  "ACTION:SWITCH|NAME:" + $oldName
              }
          } else {
              # [状态机 - 切去]：浏览器在后台
              if ([Win32]::IsIconic($targetHwnd)) {
                  [Win32]::ShowWindow($targetHwnd, 9) | Out-Null # Restore
              }
              [Win32]::ShowWindow($targetHwnd, 5) | Out-Null # Show
              [Win32]::SetForegroundWindow($targetHwnd) | Out-Null
              
              # [修复3]：必须增加微小延迟，等待窗口获得系统焦点后再激活标签
              Start-Sleep -Milliseconds 80 
              Select-Tab($targetTab) | Out-Null
              "ACTION:ACTIVATE|NAME:" + (if ($currentTab) { $currentTab.Current.Name } else { "" })
          }
      } else { "NOT_FOUND" }
    \`;

    const result = await execPowerShell(script);
    
    if (result.includes('ACTION:SWITCH') || result.includes('ACTION:ACTIVATE')) {
        const parts = result.split('NAME:');
        if (parts.length > 1) {
            let name = parts[1].trim();
            name = name.replace(/^\\\\(\\\\d+\\\\)\\\\s*/, '').split(' - ')[0].trim();
            if (name) tabHistory.set(pattern, name);
        }
        return { success: true, action: 'activated' };
    }
    if (result.includes('ACTION:RETURN')) {
        tabHistory.delete(pattern);
        return { success: true, action: 'activated' };
    }
    return { success: false, error: 'Target not found' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}`;

const startToggleIndex = content.indexOf('// 记录每个窗口上一次活跃的标签页，用于回跳逻辑');
const endToggleIndex = content.indexOf('let webActivatorShortcuts', startToggleIndex);
if (startToggleIndex !== -1 && endToggleIndex !== -1) {
    content = content.substring(0, startToggleIndex) + toggleTabCode + "\n\n" + content.substring(endToggleIndex);
}

fs.writeFileSync(filePath, content);
console.log('Fixed Robust JSON & Multi-Browser Patch Applied.');
