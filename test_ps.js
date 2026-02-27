const { spawn } = require('child_process');
function execPowerShell(script) {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    ps.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    ps.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    ps.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      if (code !== 0 && !stdout) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        console.error('PS Error:', stderr);
        resolve('');
      } else {
        resolve(stdout);
      }
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
                  if ($name -and $name -notmatch "^\d+ 个标签页$|^关闭$|^新标签页$") {
                      $null = $res.Add(@{ id = $p.Id; title = $name; processName = $p.ProcessName; hwnd = $p.MainWindowHandle.ToInt64(); type = "tab" })
                  }
              }
          }
      } catch {}
  }
  
  Write-Output "---TAB_JSON_START---"
  $ErrorActionPreference = 'Continue'
  if ($res.Count -eq 0) {
      Write-Output "[]"
  } elseif ($res.Count -eq 1) {
      Write-Output "[$($res[0] | ConvertTo-Json -Compress)]"
  } else {
      Write-Output ($res | ConvertTo-Json -Compress)
  }
  Write-Output "---TAB_JSON_END---"
`;

execPowerShell(tabScript).then(out => {
  console.log("RAW OUT:");
  console.log(out);
});
