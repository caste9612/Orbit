#Requires -Version 7
<#
.SYNOPSIS
    Estrae da NOTES.md le note della versione corrente, pronte per New-Release.ps1 -Notes.

.DESCRIPTION
    Le note di ogni release stanno in NOTES.md, nel blocco ```markdown della sezione «## Versione X.Y.Z», in
    inglese: diventano il testo della release su GitHub e le novità che Orbit mostra prima di aggiornare. La
    versione è quella di src-tauri/tauri.conf.json, così note e versione vengono dallo stesso commit.

    Lo script scrive il blocco in un file (UTF-8, righe LF) e ne restituisce il percorso. Se la sezione o il
    blocco mancano si ferma con un errore. Lo usa il workflow Release (.github/workflows/release.yml), e va
    bene anche per una release fatta in locale. Il blocco non può contenere a sua volta un blocco di codice
    con ```: il primo ``` chiude le note.

.PARAMETER OutFile
    Dove scrivere le note. Di default artifacts\notes-X.Y.Z.md (cartella ignorata da git).

.EXAMPLE
    .\scripts\New-Release.ps1 -Notes (.\scripts\Get-ReleaseNotes.ps1) -Title "Room for all your repos"
#>
param([string]$OutFile)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $repo 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
$notesLines = (Get-Content -LiteralPath (Join-Path $repo 'NOTES.md') -Raw) -split '\r?\n'

# la sezione «## Versione X.Y.Z», poi il primo blocco ```markdown prima della sezione seguente
$heading = "## Versione $version"
$start = -1; $open = -1; $close = -1
for ($i = 0; $i -lt $notesLines.Count; $i++) {
    $line = $notesLines[$i].Trim()
    if ($start -lt 0) {
        if ($line -eq $heading) { $start = $i }
        continue
    }
    if ($line.StartsWith('## ')) { break }
    if ($open -lt 0) {
        if ($line -eq '```markdown') { $open = $i }
        continue
    }
    if ($line -eq '```') { $close = $i; break }
}
if ($start -lt 0) {
    throw "In NOTES.md manca la sezione «$heading» (la versione viene da src-tauri/tauri.conf.json)."
}
if ($open -lt 0 -or $close -lt 0) {
    throw ('Nella sezione «' + $heading + '» di NOTES.md manca il blocco ```markdown con le note della release.')
}
$body = if ($close -gt $open + 1) { $notesLines[($open + 1)..($close - 1)] } else { @() }
if (-not ($body -join '').Trim()) {
    throw "Il blocco delle note nella sezione «$heading» di NOTES.md è vuoto."
}

if (-not $OutFile) { $OutFile = Join-Path $repo "artifacts\notes-$version.md" }
$OutFile = [IO.Path]::GetFullPath($OutFile, (Get-Location).Path)
New-Item -ItemType Directory -Force -Path (Split-Path $OutFile -Parent) | Out-Null
[IO.File]::WriteAllText($OutFile, (($body -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$OutFile
