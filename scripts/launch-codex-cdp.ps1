param([int]$Port = 9222)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be 1024..65535' }
$occupied = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($occupied) { throw "Port $Port is already occupied" }
$package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if (-not $package -or "$($package.SignatureKind)" -ne 'Store') { throw 'Validated OpenAI.Codex Store package not found' }
$manifest = Get-AppxPackageManifest -Package $package
$application = @($manifest.Package.Applications.Application | Where-Object { "$($_.Executable)".Replace('/','\') -ieq 'app\ChatGPT.exe' })
if ($application.Count -ne 1) { throw 'Codex application identity is ambiguous' }
$aumid = "$($package.PackageFamilyName)!$($application[0].Id)"
$exe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Validated Codex executable not found' }

Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $exe } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2

if (-not ('PrismDesk.PackageLauncher' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace PrismDesk {
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager { [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id,[MarshalAs(UnmanagedType.LPWStr)] string args,uint options,out uint pid); }
  [ComImport, Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")] class ApplicationActivationManager {}
  public static class PackageLauncher { public static uint Launch(string id,string args) { var m=(IApplicationActivationManager)new ApplicationActivationManager(); uint pid; Marshal.ThrowExceptionForHR(m.ActivateApplication(id,args,0,out pid)); return pid; } }
}
'@
}
[void][PrismDesk.PackageLauncher]::Launch($aumid, "--remote-debugging-port=$Port")

$deadline = (Get-Date).AddSeconds(12)
do {
  try {
    $pages = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
    if ($pages | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) { exit 0 }
  } catch {}
  Start-Sleep -Milliseconds 300
} while ((Get-Date) -lt $deadline)

# Some Store builds interpret package activation arguments as navigation. Retry the exact validated executable.
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $exe } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2
Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$Port"
$deadline = (Get-Date).AddSeconds(12)
do {
  try {
    $pages = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
    if ($pages | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) { exit 0 }
  } catch {}
  Start-Sleep -Milliseconds 300
} while ((Get-Date) -lt $deadline)
throw "Codex $($package.Version) did not expose a verified loopback CDP endpoint"
