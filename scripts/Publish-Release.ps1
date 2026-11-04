#Requires -Version 7
<#
.SYNOPSIS
    Unisce le release di Orbit compilate su ogni piattaforma in una sola, con un latest.json per tutte, e se vuoi
    la pubblica su GitHub (M75).

.DESCRIPTION
    New-Release.ps1 compila la piattaforma del PC dove gira (Windows: NSIS e MSI; Linux: AppImage, .deb e .rpm)
    e scrive un latest.json con le sole voci di quella piattaforma. Questo script:

    1. cerca i latest.json nelle cartelle date (-Dir, anche in sottocartelle: gli artefatti scaricati da un
       workflow) e controlla che siano tutti della versione di tauri.conf.json;
    2. unisce le loro voci in un latest.json solo, e controlla che ci siano tutte le piattaforme (Windows e
       Linux, ogni formato), salvo -AllowMissing;
    3. copia in -OutDir gli installer, le loro firme e il latest.json unito;
    4. se c'è il .deb, scrive il PKGBUILD per Arch (packaging/arch/PKGBUILD, con versione e SHA-256);
    5. con -Publish crea la release su GitHub con gh: tag vX.Y.Z sul commit corrente, le note come testo, tutti
       i file di -OutDir come asset. Prima controlla che non ci siano modifiche fuori dal commit, che il
       commit sia già su GitHub e che la release non esista già.

    Il workflow Release lo usa per l'ultimo passo, con o senza -Publish (senza: una prova a secco con gli
    stessi file che pubblicherebbe).

.PARAMETER Dir
    Cartelle con gli artefatti di New-Release.ps1, una o più.

.PARAMETER OutDir
    Dove mettere la release unita. Di default artifacts/release-all.

.PARAMETER Notes
    File Markdown con le note della versione (il testo della release). Obbligatorio con -Publish.

.PARAMETER Title
    Titolo della release dopo "Orbit vX.Y.Z — ". Senza: "Orbit vX.Y.Z".

.PARAMETER Publish
    Pubblica la release su GitHub.

.PARAMETER AllowMissing
    Accetta una release senza qualche piattaforma: le copie di Orbit di quella piattaforma non vedrebbero la
    versione nuova, e il loro controllo degli aggiornamenti darebbe errore finché non esce una release completa.

.PARAMETER CheckOnly
    Fa solo i controlli prima di pubblicare (modifiche, commit su GitHub, release già esistente) ed esce.

.EXAMPLE
    ./scripts/Publish-Release.ps1 -Dir ./win, ./linux -OutDir ./artifacts/release
    ./scripts/Publish-Release.ps1 -Dir ./win, ./linux -Notes ./artifacts/notes-1.6.0.md -Title "Orbit on Linux" -Publish
#>
param(
    [string[]]$Dir,
    [string]$OutDir,
    [string]$Notes,
    [string]$Title,
    [switch]$Publish,
    [switch]$AllowMissing,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$gitHubRepo = 'caste9612/Orbit'
$repo = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $repo 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).version

# le voci che una release completa deve avere: ogni formato riceve il suo installer
$required = @(
    'windows-x86_64', 'windows-x86_64-nsis', 'windows-x86_64-msi',
    'linux-x86_64', 'linux-x86_64-appimage', 'linux-x86_64-deb', 'linux-x86_64-rpm'
)

function Assert-Publishable {
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
    return $commit
}

if ($CheckOnly) {
    $null = Assert-Publishable
    Write-Host "Controlli per la pubblicazione di v$version superati."
    return
}
if (-not $Dir) { throw 'Indica con -Dir le cartelle con gli artefatti di New-Release.ps1.' }
if ($Publish -and -not $Notes) { throw 'Con -Publish servono le note (-Notes).' }

# --- 1-2. i latest.json di ogni piattaforma, uniti --------------------------------------------------------
$files = @(foreach ($d in $Dir) { Get-ChildItem -LiteralPath $d -Recurse -File })
$parts = @($files | Where-Object Name -eq 'latest.json')
if (-not $parts) { throw "Nessun latest.json in $($Dir -join ', ')." }
$platforms = [ordered]@{}
$notesText = $null
$pubDate = $null
foreach ($p in $parts) {
    $j = Get-Content -LiteralPath $p.FullName -Raw | ConvertFrom-Json -AsHashtable
    if ($j.version -ne $version) { throw "$($p.FullName) è della versione $($j.version), non della $version." }
    if ($null -eq $notesText) { $notesText = $j.notes }
    elseif ($j.notes -ne $notesText) { throw "Le note di $($p.FullName) non sono quelle delle altre piattaforme." }
    if (-not $pubDate -or $j.pub_date -gt $pubDate) { $pubDate = $j.pub_date }
    foreach ($k in $j.platforms.Keys) {
        if ($platforms.Contains($k)) { throw "La voce $k compare in due latest.json." }
        $platforms[$k] = $j.platforms[$k]
    }
}
$sorted = [ordered]@{}
foreach ($k in @($required | Where-Object { $platforms.Contains($_) }) + @($platforms.Keys | Where-Object { $_ -notin $required })) {
    $sorted[$k] = $platforms[$k]
}
$platforms = $sorted
$missing = @($required | Where-Object { -not $platforms.Contains($_) })
if ($missing) {
    $msg = "Mancano le voci: $($missing -join ', ')."
    if (-not $AllowMissing) { throw "$msg Le copie di Orbit di quelle piattaforme non troverebbero aggiornamenti (-AllowMissing per pubblicare lo stesso)." }
    Write-Warning $msg
}

# --- 3. installer, firme e latest.json in una cartella ----------------------------------------------------
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts/release-all' }
$OutDir = [IO.Path]::GetFullPath($OutDir)
$inputs = @($Dir | ForEach-Object { [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $_).Path) })
if ($inputs -contains $OutDir) {
    # la stessa cartella (New-Release.ps1 -Publish): basta riscrivere latest.json
    $out = $OutDir
}
else {
    if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
    New-Item -ItemType Directory -Path $OutDir | Out-Null
    $out = $OutDir
}
$names = @($platforms.Values | ForEach-Object { $_.url.Split('/')[-1] } | Select-Object -Unique)
foreach ($n in $names) {
    foreach ($want in $n, "$n.sig") {
        $f = $files | Where-Object Name -eq $want | Select-Object -First 1
        if (-not $f) { throw "Manca $want fra gli artefatti." }
        if ($f.DirectoryName -ne $out) { Copy-Item -LiteralPath $f.FullName -Destination $out }
    }
}
# la firma in latest.json deve essere quella del file pubblicato
foreach ($k in $platforms.Keys) {
    $n = $platforms[$k].url.Split('/')[-1]
    $sig = (Get-Content -LiteralPath (Join-Path $out "$n.sig") -Raw).Trim()
    if ($sig -ne $platforms[$k].signature) { throw "La firma della voce $k non è quella di $n.sig." }
}
$latest = [ordered]@{ version = $version; notes = $notesText; pub_date = $pubDate; platforms = $platforms }
$latest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'latest.json') -Encoding utf8NoBOM

# --- 4. PKGBUILD per Arch, dal .deb ------------------------------------------------------------------------
$debName = "Orbit_${version}_amd64.deb"
$debFile = Join-Path $out $debName
if (Test-Path -LiteralPath $debFile) {
    $sha = (Get-FileHash -LiteralPath $debFile -Algorithm SHA256).Hash.ToLowerInvariant()
    # LICENSE si scarica dal tag: è il file del commit pubblicato (LF ovunque, .gitattributes), lo stesso di qui
    $licSha = (Get-FileHash -LiteralPath (Join-Path $repo 'LICENSE') -Algorithm SHA256).Hash.ToLowerInvariant()
    $template = Get-Content -LiteralPath (Join-Path $repo 'packaging/arch/PKGBUILD') -Raw
    $pkgbuild = $template -replace '(?m)^pkgver=.*$', "pkgver=$version" -replace '(?m)^sha256sums=.*$', "sha256sums=('$sha' '$licSha')"
    # LF: makepkg legge un file di shell
    [IO.File]::WriteAllText((Join-Path $out 'PKGBUILD'), ($pkgbuild -replace "`r`n", "`n"))
}

Write-Host "Release $version unita in ${out}:"
Get-ChildItem -LiteralPath $out | ForEach-Object { Write-Host ("  {0}  {1:N0} KB" -f $_.Name, ($_.Length / 1KB)) }
Write-Host "Voci di latest.json: $($platforms.Keys -join ', ')"

# --- 5. pubblicazione -------------------------------------------------------------------------------------
if ($Publish) {
    $commit = Assert-Publishable
    $releaseTitle = if ($Title) { "Orbit v$version — $Title" } else { "Orbit v$version" }
    Write-Host "Pubblico $releaseTitle dal commit $($commit.Substring(0, 7))..."
    $assets = @((Get-ChildItem -LiteralPath $out -File).FullName)
    gh release create "v$version" @assets --repo $gitHubRepo --target $commit --title $releaseTitle --notes-file (Resolve-Path -LiteralPath $Notes)
    if ($LASTEXITCODE -ne 0) { throw 'La pubblicazione su GitHub non è riuscita.' }
}
