
  $ErrorActionPreference = 'Continue'
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
                  if ($name -and $name -notmatch "^d+ 个标签页$|^关闭$|^新标签页$") {
                      $null = $res.Add(@{ id = $p.Id; title = $name; processName = $p.ProcessName; hwnd = $p.MainWindowHandle.ToInt64(); type = "tab" })
                  }
              }
          }
      } catch {
          Write-Error $_
      }
  }
  
  Write-Output "---TAB_JSON_START---"
  if ($res.Count -eq 0) {
      Write-Output "[]"
  } elseif ($res.Count -eq 1) {
      Write-Output "[$($res[0] | ConvertTo-Json -Compress)]"
  } else {
      Write-Output ($res | ConvertTo-Json -Compress)
  }
  Write-Output "---TAB_JSON_END---"
