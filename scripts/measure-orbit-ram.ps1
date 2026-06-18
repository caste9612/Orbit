# Misura la RAM REALE (private working set) di tutti i processi di Orbit:
#   core Rust (orbit.exe) + stack WebView2 (msedgewebview2.exe della cartella dati di Orbit).
# Il private working set non conta due volte le pagine Chromium condivise -> e' il dato onesto.
# Uso:  pwsh scripts/measure-orbit-ram.ps1 [-Label "2 finestre"]
param([string]$Label = "")

$cores = @(Get-CimInstance Win32_Process -Filter "Name='orbit.exe'")
if (-not $cores) { Write-Output "Nessun orbit.exe in esecuzione."; return }

# WebView2 di Orbit: identificati dalla command line (cartella dati / exe-name dell'app).
# Euristica: la command line di msedgewebview2 contiene 'orbit' (user-data-folder o --webview-exe-name).
$wv = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" |
  Where-Object { $_.CommandLine -match 'orbit' })

$procs = $cores + $wv
$ids = @{}; foreach ($p in $procs) { $ids[[int]$p.ProcessId] = $p }
$perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $ids.ContainsKey([int]$_.IDProcess) }

$rows = foreach ($pr in $perf) {
  $info = $ids[[int]$pr.IDProcess]
  $kind = if ($info.Name -eq 'orbit.exe') { 'core' }
          elseif ($info.CommandLine -match '--type=([a-zA-Z-]+)') { $Matches[1] }
          else { 'browser' }
  [pscustomobject]@{ PID = [int]$pr.IDProcess; Kind = $kind; PrivMB = [math]::Round($pr.WorkingSetPrivate / 1MB, 1) }
}

$instances = $cores.Count
$totalPriv = [math]::Round((($rows | Measure-Object PrivMB -Sum).Sum), 1)

if ($Label) { Write-Output "== $Label ==" }
($rows | Sort-Object PrivMB -Descending | Format-Table -AutoSize | Out-String).TrimEnd() | Write-Output
Write-Output ("Istanze orbit.exe  : {0}" -f $instances)
Write-Output ("Processi totali    : {0}  ({1} WebView2)" -f $rows.Count, ($rows.Count - $instances))
Write-Output ("RAM private TOTALE  : {0} MB" -f $totalPriv)
