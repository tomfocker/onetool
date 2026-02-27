const { spawn } = require('child_process');
function execPowerShell(script) {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    ps.stdout.on('data', (c) => stdout += c.toString('utf8'));
    ps.stderr.on('data', (c) => stderr += c.toString('utf8'));
    ps.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr, code });
    });
    ps.stdin.write('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' + script);
    ps.stdin.end();
  });
}
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
      # Use manual string joining to absolutely guarantee no pipeline/depth issues
      $jsonElements = New-Object System.Collections.ArrayList
      foreach ($item in $res) {
          $title = ($item.title -replace '\\', '\\\\') -replace '"', '\"'
          $proc = $item.processName
          $id = $item.id
          $hwnd = $item.hwnd
          $null = $jsonElements.Add("{\`"id\`":$id,\`"title\`":\`"$title\`",\`"processName\`":\`"$proc\`",\`"hwnd\`":$hwnd,\`"type\`":\`"tab\`"}")
      }
      Write-Output "[$($jsonElements -join ',')]"
  }
  Write-Output "---TAB_JSON_END---"
`;

execPowerShell(tabScript).then(console.log);
