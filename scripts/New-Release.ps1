#Requires -Version 7
<#
.SYNOPSIS
    Prepara la release di Orbit — installer firmati e latest.json per gli aggiornamenti — e, se vuoi, la
    pubblica su GitHub.

.DESCRIPTION
    Gli Orbit installati (dalla v0.10) controllano
    https://github.com/caste9612/Orbit/releases/latest/download/latest.json: se la versione lì è più nuova
    propongono di aggiornare, scaricano l'installer, ne verificano la firma con la chiave pubblica di
    tauri.conf.json e lo avviano. Per questo ogni release deve avere installer firmati e latest.json, ed è
    ciò che fa questo script:

    1. controlla che la versione sia la stessa nei sei punti (package.json, package-lock.json due volte,
       Cargo.toml, Cargo.lock, tauri.conf.json);
    2. compila in release con la chiave PRIVATA di firma (-KeyPath, fuori dal repo): installer NSIS e MSI
       con le loro firme .sig;
    3. scrive latest.json (versione, note, data, firma e indirizzo di ogni installer);
    4. copia tutto in artifacts\release (ignorata da git);
    5. con -Publish crea la release su GitHub con gh, col tag sul commit compilato.

    Una release pubblicata SENZA latest.json non viene vista dagli Orbit installati; una pre-release
    nemmeno (per GitHub "latest" è l'ultima release normale).

.PARAMETER Notes
    File Markdown con le note della versione, in inglese come le release di Orbit su GitHub: diventano il
    testo della release e le novità che Orbit mostra prima di aggiornare.

.PARAMETER Title
    Titolo della release dopo "Orbit vX.Y.Z — " (es. "Updates from GitHub"). Senza: "Orbit vX.Y.Z".

.PARAMETER Publish
    Pubblica la release su GitHub (serve gh collegato all'account). Prima controlla che non ci siano
    modifiche fuori dal commit, che il commit sia già su GitHub e che la release non esista già.

.PARAMETER KeyPath
    Chiave privata di firma degli aggiornamenti. Se è protetta da password, mettila in
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD prima di lanciare lo script.

.EXAMPLE
    .\scripts\New-Release.ps1 -Notes .\notes-0.10.0.md
    .\scripts\New-Release.ps1 -Notes .\notes-0.10.0.md -Title "Updates from GitHub" -Publish
#>
param(
    [Parameter(Mandatory)] [string]$Notes,
    [string]$Title,
    [switch]$Publish,
    [string]$KeyPath = (Join-Path $HOME '.tauri\orbit-updater.key')
)

$ErrorActionPreference = 'Stop'
$gitHubRepo = 'caste9612/Orbit'
$repo = Split-Path $PSScriptRoot -Parent

# --- 1. versione: la stessa nei sei punti (il lockfile era rimasto indietro per cinque release) -----------
$conf = Get-Content -LiteralPath (Join-Path $repo 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json -AsHashtable
$version = $conf.version
$lock = Get-Content -LiteralPath (Join-Path $repo 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$cargoToml = Get-Content -LiteralPath (Join-Path $repo 'src-tauri\Cargo.toml') -Raw
$cargoLock = Get-Content -LiteralPath (Join-Path $repo 'src-tauri\Cargo.lock') -Raw
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
    $changes = git -C $repo status --porcelain --untracked-files=no
    if ($changes) { throw "Ci sono modifiche non ancora nel commit:`n$($changes -join "`n")" }
    git -C $repo fetch --quiet origin
    if ($LASTEXITCODE -ne 0) { throw 'Non riesco a leggere il repository su GitHub.' }
    $commit = git -C $repo rev-parse HEAD
    if (-not (git -C $repo branch --remotes --contains $commit)) {
        throw "Il commit $($commit.Substring(0, 7)) non è ancora su GitHub: fai prima git push."
    }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    gh release view "v$version" --repo $gitHubRepo *> $null
    $exists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $previous
    if ($exists) { throw "Su GitHub c'è già la release v${version}: alza la versione nei sei punti." }
}

# --- 2. compilazione firmata ------------------------------------------------------------------------------
Write-Host "Compilo Orbit $version (installer firmati)..."
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $KeyPath -Raw
if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '' }
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
}

# --- 3-4. artefatti e latest.json -------------------------------------------------------------------------
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $repo 'src-tauri\target' }
$bundle = Join-Path $target 'release\bundle'
$nsis = Get-Item -LiteralPath (Join-Path $bundle "nsis\Orbit_${version}_x64-setup.exe")
$msi = Get-Item -LiteralPath (Join-Path $bundle "msi\Orbit_${version}_x64_en-US.msi")
$out = Join-Path $repo 'artifacts\release'
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
foreach ($f in $nsis, $msi) {
    Copy-Item -LiteralPath $f.FullName, "$($f.FullName).sig" -Destination $out
}
$download = "https://github.com/$gitHubRepo/releases/download/v$version"
$nsisEntry = @{ signature = (Get-Content -LiteralPath "$($nsis.FullName).sig" -Raw).Trim(); url = "$download/$($nsis.Name)" }
$msiEntry = @{ signature = (Get-Content -LiteralPath "$($msi.FullName).sig" -Raw).Trim(); url = "$download/$($msi.Name)" }
$latest = [ordered]@{
    version   = $version
    notes     = (Get-Content -LiteralPath $notesPath -Raw).Trim()
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    # chi ha installato con l'NSIS (il caso normale) riceve l'NSIS, chi con l'MSI l'MSI
    platforms = [ordered]@{
        'windows-x86_64'      = $nsisEntry
        'windows-x86_64-nsis' = $nsisEntry
        'windows-x86_64-msi'  = $msiEntry
    }
}
$latest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'latest.json') -Encoding utf8NoBOM
Write-Host "Release pronta in $out"
Get-ChildItem -LiteralPath $out | ForEach-Object { Write-Host ("  {0}  {1:N0} KB" -f $_.Name, ($_.Length / 1KB)) }

# --- 5. pubblicazione -------------------------------------------------------------------------------------
if ($Publish) {
    $releaseTitle = if ($Title) { "Orbit v$version — $Title" } else { "Orbit v$version" }
    Write-Host "Pubblico $releaseTitle dal commit $($commit.Substring(0, 7))..."
    $assets = @((Get-ChildItem -LiteralPath $out -File).FullName)
    gh release create "v$version" @assets --repo $gitHubRepo --target $commit --title $releaseTitle --notes-file $notesPath
    if ($LASTEXITCODE -ne 0) { throw 'La pubblicazione su GitHub non è riuscita.' }
}
