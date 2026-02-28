\ufeff
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
  