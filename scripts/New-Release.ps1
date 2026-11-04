#Requires -Version 7
<#
.SYNOPSIS
    Prepara la release di Orbit per la piattaforma di questo PC — installer firmati e latest.json per gli
    aggiornamenti — e, se vuoi, la pubblica su GitHub.

.DESCRIPTION
    Gli Orbit installati (dalla v1.0) controllano
    https://github.com/caste9612/Orbit/releases/latest/download/latest.json: se la versione lì è più nuova
    propongono di aggiornare, scaricano l'installer della loro piattaforma, ne verificano la firma con la chiave
    pubblica di tauri.conf.json e lo installano. Per questo ogni release deve avere installer firmati e
    latest.json, ed è ciò che fa questo script, sulla piattaforma dove gira:

    1. controlla che la versione sia la stessa nei sei punti (package.json, package-lock.json due volte,
       Cargo.toml, Cargo.lock, tauri.conf.json);
    2. compila in release con la chiave PRIVATA di firma (-KeyPath, fuori dal repo), con le loro firme .sig:
       - Windows: installer NSIS e MSI;
       - Linux (M75): AppImage, .deb e .rpm;
    3. scrive latest.json con le voci di questa piattaforma (versione, note, data, firma e indirizzo di ogni
       installer);
    4. copia tutto in artifacts/release (ignorata da git);
    5. con -Publish passa la cartella a Publish-Release.ps1, che crea la release su GitHub con gh.

    Una release completa ha le due piattaforme: il workflow Release di GitHub Actions compila su Windows e su
    Linux e unisce i due latest.json con Publish-Release.ps1. Da qui, con -Publish, Publish-Release.ps1 rifiuta
    una release con una piattaforma sola, a meno di -AllowMissing: gli Orbit della piattaforma mancante non
    troverebbero più aggiornamenti per sé.

.PARAMETER Notes
    File Markdown con le note della versione, in inglese come le release di Orbit su GitHub: diventano il
    testo della release e le novità che Orbit mostra prima di aggiornare.

.PARAMETER Title
    Titolo della release dopo "Orbit vX.Y.Z — " (es. "Updates from GitHub"). Senza: "Orbit vX.Y.Z".

.PARAMETER Publish
    Pubblica la release su GitHub (serve gh collegato all'account). Prima controlla che non ci siano
    modifiche fuori dal commit, che il commit sia già su GitHub e che la release non esista già.

.PARAMETER AllowMissing
    Con -Publish: pubblica anche se manca una piattaforma (vedi sopra).

.PARAMETER KeyPath
    Chiave privata di firma degli aggiornamenti, protetta da password (dalla 1.0): lo script la chiede senza
    mostrarla — o la legge da $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD, l'unico modo senza un terminale
    interattivo — e la prova prima di compilare.

.EXAMPLE
    ./scripts/New-Release.ps1 -Notes ./artifacts/notes-1.6.0.md
    ./scripts/New-Release.ps1 -Notes ./artifacts/notes-1.6.0.md -Title "Orbit on Linux" -Publish -AllowMissing
#>
param(
    [Parameter(Mandatory)] [string]$Notes,
    [string]$Title,
    [switch]$Publish,
    [switch]$AllowMissing,
    [string]$KeyPath = (Join-Path $HOME '.tauri/orbit-updater.key')
)

$ErrorActionPreference = 'Stop'
$gitHubRepo = 'caste9612/Orbit'
$repo = Split-Path $PSScriptRoot -Parent
if (-not ($IsWindows -or $IsLinux)) { throw 'Le release si compilano su Windows o su Linux.' }

# --- 1. versione: la stessa nei sei punti (il lockfile era rimasto indietro per cinque release) -----------
$conf = Get-Content -LiteralPath (Join-Path $repo 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json -AsHashtable
$version = $conf.version
$lock = Get-Content -LiteralPath (Join-Path $repo 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$cargoToml = Get-Content -LiteralPath (Join-Path $repo 'src-tauri/Cargo.toml') -Raw
$cargoLock = Get-Content -LiteralPath (Join-Path $repo 'src-tauri/Cargo.lock') -Raw
$found = [ordered]@{
    'tauri.conf.json'                 = $version
    'package.json'                    = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
    'package-lock.json'               = $lock.version
    'package-lock.json (packages."")' = $lock.packages[''].version
    'Cargo.toml'                      = [regex]::Match($cargoToml, '(?m)^version = "([^"]+)"').Groups[1].Value
    'Cargo.lock (orbit)'              = [regex]::Match($cargoLock, '(?m)^name = "orbit"\r?\nversion = "([^"]+)"').Groups[1].Value
}
$wrong = $found.GetEnumerator() | Where-Object { $_.Value -ne $version }
if ($wrong) {
    $list = ($found.GetEnumerator() | ForEach-Object { "  $($_.Key): $($_.Value)" }) -join "`n"
    throw "La versione non è la stessa ovunque:`n$list"
}

$notesPath = Resolve-Path -LiteralPath $Notes
if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Manca la chiave privata di firma: $KeyPath (generata con: npx tauri signer generate -w `"$KeyPath`")"
}

# --- controlli prima di compilare, così un push mancante non costa una compilazione -----------------------
if ($Publish) {
    & (Join-Path $PSScriptRoot 'Publish-Release.ps1') -CheckOnly
}

# --- 2. compilazione firmata ------------------------------------------------------------------------------
# La chiave ha una password (dalla 1.0): se non è già nell'ambiente la chiede, senza mostrarla; resta solo in
# questo processo e alla fine si toglie. La si prova subito firmando un file di prova, così una password
# sbagliata non costa una compilazione.
$askedPassword = $false
if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    if ([Console]::IsInputRedirected) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    }
    else {
        $secure = Read-Host 'Password della chiave di firma' -AsSecureString
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', $secure).Password
    }
    $askedPassword = $true
}
$probe = Join-Path ([IO.Path]::GetTempPath()) "orbit-sign-probe-$PID.txt"
Set-Content -LiteralPath $probe -Value 'probe' -Encoding utf8NoBOM
Push-Location $repo
try {
    npx tauri signer sign -f $KeyPath $probe *> $null
    $signed = $LASTEXITCODE -eq 0
}
finally {
    Pop-Location
    Remove-Item -LiteralPath $probe, "$probe.sig" -ErrorAction SilentlyContinue
}
if (-not $signed) {
    if ($askedPassword) { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }
    throw "La chiave $KeyPath non si apre con questa password (senza un terminale interattivo mettila prima in `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD)."
}

$platform = if ($IsWindows) { 'Windows' } else { 'Linux' }
Write-Host "Compilo Orbit $version per $platform (installer firmati)..."
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $KeyPath -Raw
# gli artefatti firmati SOLO qui: in tauri.conf.json un build normale fallirebbe senza la chiave
$extra = Join-Path ([IO.Path]::GetTempPath()) "orbit-release-$PID.json"
'{ "bundle": { "createUpdaterArtifacts": true } }' | Set-Content -LiteralPath $extra -Encoding utf8NoBOM
Push-Location $repo
try {
    npx tauri build --config $extra
    if ($LASTEXITCODE -ne 0) {
        throw "La compilazione non è riuscita: guarda gli errori qui sopra (con 'failed to read plugin permissions' serve un cargo clean in src-tauri)."
    }
}
finally {
    Pop-Location
    Remove-Item -LiteralPath $extra -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    if ($askedPassword) { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }
}

# --- 3-4. artefatti e latest.json -------------------------------------------------------------------------
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $repo 'src-tauri/target' }
$bundle = Join-Path $target 'release/bundle'
$download = "https://github.com/$gitHubRepo/releases/download/v$version"
function Get-Installer([string]$rel) { Get-Item -LiteralPath (Join-Path $bundle $rel) }
function New-Entry($file) {
    [ordered]@{ signature = (Get-Content -LiteralPath "$($file.FullName).sig" -Raw).Trim(); url = "$download/$($file.Name)" }
}
if ($IsWindows) {
    $nsis = Get-Installer "nsis/Orbit_${version}_x64-setup.exe"
    $msi = Get-Installer "msi/Orbit_${version}_x64_en-US.msi"
    $installers = @($nsis, $msi)
    # chi ha installato con l'NSIS (il caso normale) riceve l'NSIS, chi con l'MSI l'MSI
    $platforms = [ordered]@{
        'windows-x86_64'      = New-Entry $nsis
        'windows-x86_64-nsis' = New-Entry $nsis
        'windows-x86_64-msi'  = New-Entry $msi
    }
}
else {
    $appImage = Get-Installer "appimage/Orbit_${version}_amd64.AppImage"
    $deb = Get-Installer "deb/Orbit_${version}_amd64.deb"
    $rpm = Get-Installer "rpm/Orbit-${version}-1.x86_64.rpm"
    $installers = @($appImage, $deb, $rpm)
    # ogni copia riceve il suo formato (l'updater legge quale dal binario); `linux-x86_64` è il ripiego
    # dell'updater quando la voce del formato manca: l'AppImage, l'unico che non chiede la password
    $platforms = [ordered]@{
        'linux-x86_64'          = New-Entry $appImage
        'linux-x86_64-appimage' = New-Entry $appImage
        'linux-x86_64-deb'      = New-Entry $deb
        'linux-x86_64-rpm'      = New-Entry $rpm
    }
}
$out = Join-Path $repo 'artifacts/release'
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
foreach ($f in $installers) {
    Copy-Item -LiteralPath $f.FullName, "$($f.FullName).sig" -Destination $out
}
$latest = [ordered]@{
    version   = $version
    notes     = (Get-Content -LiteralPath $notesPath -Raw).Trim()
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = $platforms
}
$latest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'latest.json') -Encoding utf8NoBOM
Write-Host "Release per $platform pronta in $out"
Get-ChildItem -LiteralPath $out | ForEach-Object { Write-Host ("  {0}  {1:N0} KB" -f $_.Name, ($_.Length / 1KB)) }

# --- 5. pubblicazione -------------------------------------------------------------------------------------
if ($Publish) {
    $params = @{ Dir = $out; Notes = $notesPath; Publish = $true; AllowMissing = $AllowMissing }
    if ($Title) { $params.Title = $Title }
    & (Join-Path $PSScriptRoot 'Publish-Release.ps1') @params
}
