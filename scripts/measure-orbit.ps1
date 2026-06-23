# Report di footprint/performance di Orbit (Tauri). NON modifica l'app: legge solo dal SO.
#   - RAM private reale (working set PRIVATO: non conta due volte le pagine Chromium condivise)
#   - CPU a riposo (campionata su -Seconds, normalizzata sui core logici)
#   - thread / handle (impatto sulle risorse)
#   - dimensioni statiche su disco (binario release, installer MSI/NSIS, frontend dist/)
# Copre core Rust (orbit.exe) + stack WebView2 (msedgewebview2.exe della cartella dati di Orbit).
# Le istanze prod (installata) e dev (target\debug) CONDIVIDONO lo stack WebView2 (stesso bundle id):
# per una misura "pulita" di una sola istanza, chiudi la dev + Vite e lascia una sola finestra.
# Uso:  pwsh scripts/measure-orbit.ps1 [-Label "1 finestra, progetto aperto"] [-Seconds 5]
param([string]$Label = "", [int]$Seconds = 5)

$cores = @(Get-CimInstance Win32_Process -Filter "Name='orbit.exe'")
if (-not $cores) { Write-Output "Nessun orbit.exe in esecuzione."; return }

# WebView2 di Orbit: la command line contiene 'orbit' (user-data-folder / --webview-exe-name)
$wv = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" |
  Where-Object { $_.CommandLine -match 'orbit' })

$cim = $cores + $wv
$ids = @{}; foreach ($p in $cim) { $ids[[int]$p.ProcessId] = $p }

# snapshot CPU iniziale (tempo processore cumulativo), poi intervallo, poi snapshot RAM/CPU finale
$cpu0 = @{}
foreach ($id in $ids.Keys) {
  try { $cpu0[$id] = (Get-Process -Id $id -ErrorAction Stop).TotalProcessorTime.TotalSeconds } catch {}
}
Start-Sleep -Seconds $Seconds

$nproc = [Environment]::ProcessorCount
$perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $ids.ContainsKey([int]$_.IDProcess) }

$rows = foreach ($pr in $perf) {
  $id = [int]$pr.IDProcess; $info = $ids[$id]
  $kind = if ($info.Name -eq 'orbit.exe') {
            if ($info.ExecutablePath -like '*\target\debug\*') { 'core(dev)' } else { 'core' }
          } elseif ($info.CommandLine -match '--type=([a-zA-Z-]+)') { $Matches[1] }
          else { 'browser' }
  $proc = try { Get-Process -Id $id -ErrorAction Stop } catch { $null }
  $cpu = if ($proc -and $cpu0.ContainsKey($id)) {
           [math]::Round((($proc.TotalProcessorTime.TotalSeconds - $cpu0[$id]) / $Seconds / $nproc) * 100, 2)
         } else { 0 }
  [pscustomobject]@{
    PID     = $id
    Kind    = $kind
    PrivMB  = [math]::Round($pr.WorkingSetPrivate / 1MB, 1)
    WSMB    = [math]::Round($pr.WorkingSet / 1MB, 1)
    Threads = if ($proc) { $proc.Threads.Count } else { 0 }
    Handles = if ($proc) { $proc.HandleCount } else { 0 }
    'CPU%'  = $cpu
  }
}

$instances = $cores.Count
$sumPriv = [math]::Round((($rows | Measure-Object PrivMB -Sum).Sum), 1)
$sumCpu  = [math]::Round((($rows | Measure-Object 'CPU%' -Sum).Sum), 2)
$sumThr  = ($rows | Measure-Object Threads -Sum).Sum
$sumHnd  = ($rows | Measure-Object Handles -Sum).Sum

if ($Label) { Write-Output "== $Label ==" }
($rows | Sort-Object PrivMB -Descending | Format-Table -AutoSize | Out-String).TrimEnd() | Write-Output
Write-Output ""
Write-Output ("Istanze orbit.exe    : {0}" -f $instances)
Write-Output ("Processi totali      : {0}  ({1} WebView2)" -f $rows.Count, ($rows.Count - $instances))
Write-Output ("RAM private TOTALE   : {0} MB" -f $sumPriv)
Write-Output ("CPU nel campione     : {0} %   (somma processi, media su {1}s, {2} core logici)" -f $sumCpu, $Seconds, $nproc)
Write-Output ("Thread / Handle      : {0} / {1}" -f $sumThr, $sumHnd)

# --- dimensioni statiche (leggerezza su disco) ---
$rel = Join-Path $PSScriptRoot '..\src-tauri\target\release'
function Get-MB($path) { if (Test-Path $path) { [math]::Round((Get-Item $path).Length / 1MB, 2) } else { '-' } }
$msi  = Get-ChildItem (Join-Path $rel 'bundle\msi\*.msi') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$nsis = Get-ChildItem (Join-Path $rel 'bundle\nsis\*-setup.exe') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$dist = Join-Path $PSScriptRoot '..\dist'
$distMB = if (Test-Path $dist) { [math]::Round((Get-ChildItem $dist -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 2) } else { '-' }

Write-Output ""
Write-Output "-- Dimensioni statiche --"
Write-Output ("Binario orbit.exe    : {0} MB" -f (Get-MB (Join-Path $rel 'orbit.exe')))
Write-Output ("Installer MSI        : {0} MB" -f $(if ($msi)  { [math]::Round($msi.Length / 1MB, 2) }  else { '-' }))
Write-Output ("Installer NSIS       : {0} MB" -f $(if ($nsis) { [math]::Round($nsis.Length / 1MB, 2) } else { '-' }))
Write-Output ("Frontend dist/       : {0} MB" -f $distMB)
