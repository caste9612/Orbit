# Lume

IDE minimale e **leggero**, pensato come companion per **Claude Code**: editi il codice,
navighi il progetto, gestisci git e tieni Claude Code in un terminale integrato — il tutto
in un'app desktop cross-platform che pesa pochissimo.

> Non è un IDE pesante (niente LSP/debugger/refactoring) né una GUI di chat per Claude.

## Funzionalità
- **Albero file** virtualizzato e lazy, con icone per tipo, gestione file dal menu
  contestuale (nuovo/rinomina/elimina/copia percorso) e **decorazioni git** (i file
  modificati — es. da Claude — sono evidenziati in tempo reale).
- **Editor** CodeMirror 6: highlighting multi-linguaggio (lazy), guide di indentazione,
  breadcrumb del file, salvataggio, auto-reload dei file modificati dall'esterno (es. da
  Claude) e **find/replace** (Ctrl+F). Status bar con riga:colonna, linguaggio e fine-riga reali.
- **Quick-open** dei file per nome con ranking fuzzy (Ctrl+P).
- **Ricerca** testuale in tutto il progetto.
- **Git** locale: status, diff, stage/unstage, commit, cambio/creazione ramo (anche dal
  selettore nella status bar), annulla modifiche (discard) e cronologia dei commit con diff.
- **Istanze multiple**: "Nuova finestra" apre l'IDE su un altro progetto; sessione separata
  per cartella.
- **Scaffale**: metti da parte le cartelle che non ti interessano (per categoria) per pulire
  l'albero senza perderle — restano in fondo, sfogliabili inline. Salvato in `.orbit/shelf.json`.
- **Terminale** integrato (PTY reale, renderer WebGL) docked a destra, con **tab multiple** e
  scelta della shell, **percorsi cliccabili** nell'output (apre il file alla riga) + finestra
  flottante always-on-top — tieni `claude` in una tab e i comandi in un'altra.
- **Esegui ▶** configurazioni di run (stile IntelliJ) da `.orbit/run.json`: comandi
  lanciabili con un click in una tab del terminale. Le crea Claude Code — l'IDE gli spiega
  il formato in `CLAUDE.md` ("Prepara per Claude").
- **Persistenza di sessione**: riapre ultima cartella, tab e layout dei pannelli.

## Scorciatoie
| Tasto | Azione |
|---|---|
| `Ctrl/Cmd+P` | Apri file per nome (quick-open) |
| `Ctrl/Cmd+F` | Cerca/sostituisci nel file |
| `Ctrl/Cmd+S` | Salva il file attivo |
| `Ctrl/Cmd+K` | Apri cartella |
| `Ctrl/Cmd+B` | Mostra/nascondi sidebar |
| ``Ctrl/Cmd+` `` | Mostra/nascondi terminale |

## Stack
- [Tauri 2](https://tauri.app) (Rust + webview di sistema, **non** Electron)
- Svelte 5 + Vite + TypeScript
- Tailwind v4 (token del tema dark)
- CodeMirror 6 (editor) · xterm.js + portable-pty (terminale)
- git2/libgit2 (git) · notify (file watcher)

## Sviluppo
```bash
npm install
npm run tauri dev      # avvia in modalità sviluppo (hot reload)
```

## Build
```bash
npm run tauri build    # produce binario + installer in src-tauri/target/release
```

## Test
```bash
npm run check                                    # type-check Svelte/TS (svelte-check)
cargo test --manifest-path src-tauri/Cargo.toml  # unit test del backend (filesystem/ricerca)
```

## Requisiti
- Node ≥ 20, Rust stable, e i prerequisiti Tauri per la piattaforma
  (vedi https://tauri.app/start/prerequisites/).
- Windows: WebView2 (preinstallato su Win11) + MSVC build tools.
- Linux: WebKitGTK 4.1 + libsoup3.
- macOS: Xcode command line tools.

Le decisioni tecniche e la giustificazione delle dipendenze sono in [NOTES.md](./NOTES.md).
