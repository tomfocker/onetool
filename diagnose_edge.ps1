$ErrorActionPreference = 'SilentlyContinue'
Write-Host "--- Edge Tab Discovery Diagnostic ---"

$edgeProcs = Get-Process -Name "msedge" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (!$edgeProcs) {
    Write-Host "ERROR: No Edge windows found."
    exit
}
Write-Host ("Found " + $edgeProcs.Count + " Edge main processes.")

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
} catch {
    Write-Host "ERROR: Failed to load UIA assemblies."
}

foreach ($p in $edgeProcs) {
    Write-Host ("`nTesting Window: " + $p.MainWindowTitle + " (HWND: " + $p.MainWindowHandle + ")")
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    
    # Method 1: All TabItems (Descendants)
    $cond1 = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlTypes]::TabItem)
    $tabs1 = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond1)
    Write-Host ("  M1 (Descendants TabItem): Count = " + $tabs1.Count)
    
    # Method 2: ListItems (Often used for vertical tabs)
    $cond2 = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlTypes]::ListItem)
    $tabs2 = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond2)
    Write-Host ("  M2 (Descendants ListItem): Count = " + $tabs2.Count)

    # Method 3: Direct Tree Walking (More reliable but slower)
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $element = $root
    $tabCount = 0
    # Just a sample to see if we can find ANY tab via walker
    $tabs3 = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    Write-Host ("  M3 (Total Elements in UI Tree): Count = " + $tabs3.Count)

    # Output Sample Names from M1
    if ($tabs1.Count -gt 0) {
        Write-Host "  Sample Tab Names from M1:"
        foreach ($t in $tabs1) {
            Write-Host ("    > " + $t.Current.Name)
        }
    }
}
Write-Host "`n--- Diagnostic End ---"
