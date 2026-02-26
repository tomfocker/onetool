const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/main/index.ts');
const content = fs.readFileSync(filePath, 'utf8');

const toggleTabCode = `
const tabHistory = new Map();

async function toggleTab(pattern: string): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    const escapedPattern = pattern.replace(/"/g, '\\\\"');
    const lastTabName = tabHistory.get(pattern) || "";

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
            }
"@
      }

      $edge = Get-Process -Name "msedge" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if (!$edge) { "NOT_RUNNING"; exit }

      $hwnd = $edge.MainWindowHandle
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
      $itemCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlTypes]::TabItem)
      $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
      
      $targetTab = $null
      $currentTab = $null
      $returnTab = $null

      foreach ($t in $tabs) {
          $name = $t.Current.Name
          if ($name -match "\${escapedPattern}") { $targetTab = $t }
          if ($name -eq "\${lastTabName}") { $returnTab = $t }
          $selPattern = $null
          if ($t.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selPattern)) {
              if ($selPattern.Current.IsSelected) { $currentTab = $t }
          }
      }

      $fgHwnd = [Win32]::GetForegroundWindow()
      if ($targetTab) {
          $sel = $targetTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
          if ($fgHwnd -eq $hwnd) {
              if ($currentTab -and $currentTab.Current.Name -match "\${escapedPattern}") {
                  if ($returnTab) {
                      $returnTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
                      "ACTION:RETURN|NAME:" + $returnTab.Current.Name
                  } else { "ACTION:ALREADY_HERE" }
              } else {
                  $oldName = if ($currentTab) { $currentTab.Current.Name } else { "" }
                  $sel.Select()
                  "ACTION:SWITCH|NAME:" + $oldName
              }
          } else {
              [Win32]::ShowWindow($hwnd, 9) | Out-Null
              [Win32]::ShowWindow($hwnd, 5) | Out-Null
              [Win32]::SetForegroundWindow($hwnd) | Out-Null
              $sel.Select()
              "ACTION:ACTIVATE|NAME:" + (if ($currentTab) { $currentTab.Current.Name } else { "" })
          }
      } else { "NOT_FOUND" }
    \`;

    const result = await execPowerShell(script);
    if (result.includes('ACTION:SWITCH') || result.includes('ACTION:ACTIVATE')) {
        const parts = result.split('NAME:');
        if (parts.length > 1) tabHistory.set(pattern, parts[1].trim());
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
}
`;

const startToggleIndex = content.indexOf('async function toggleTab');
const nextAfterToggleIndex = content.indexOf('let webActivatorShortcuts', startToggleIndex);
const updatedContent = content.substring(0, startToggleIndex) + toggleTabCode + "\n\n" + content.substring(nextAfterToggleIndex);

fs.writeFileSync(filePath, updatedContent);
console.log('Fixed Patch Applied.');
