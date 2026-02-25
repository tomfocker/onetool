param(
    [int]$Interval = 100,
    [string]$Button = "left",
    [string]$ControlFile = ""
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@

$downFlag = switch ($Button) {
    "left" { 2 }
    "right" { 8 }
    "middle" { 32 }
    default { 2 }
}
$upFlag = switch ($Button) {
    "left" { 4 }
    "right" { 16 }
    "middle" { 64 }
    default { 4 }
}

while ($true) {
    if ($ControlFile -ne "" -and (Test-Path $ControlFile)) {
        $content = Get-Content $ControlFile -ErrorAction SilentlyContinue
        if ($content -eq "STOP") {
            break
        }
    }
    
    [Mouse]::mouse_event($downFlag, 0, 0, 0, 0)
    [Mouse]::mouse_event($upFlag, 0, 0, 0, 0)
    
    Start-Sleep -Milliseconds $Interval
}
