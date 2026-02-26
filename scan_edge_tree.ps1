
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$edge = Get-Process -Name "msedge" | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$root = [System.Windows.Automation.AutomationElement]::FromHandle($edge.MainWindowHandle)

# 抓取所有具有名称的元素，查看它们的类型
$allNamed = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)

Write-Host "--- Scanning All Named Elements in Edge ---"
foreach ($el in $allNamed) {
    $name = $el.Current.Name
    $type = $el.Current.LocalizedControlType
    if ($name -and $name.Length -gt 2 -and $name -notmatch "Microsoft Edge") {
        Write-Host ("Name: " + $name + " | Type: " + $type)
    }
}
Write-Host "--- End Scan ---"
