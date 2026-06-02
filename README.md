# Lume

IDE minimale e **leggero**, pensato come companion per **Claude Code**: editi il codice,
navighi il progetto, gestisci git e tieni Claude Code in un terminale integrato — il tutto
in un'app desktop cross-platform che pesa pochissimo.

> Non è un IDE pesante (niente LSP/debugger/refactoring) né una GUI di chat per Claude.

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

## Requisiti
- Node ≥ 20, Rust stable, e i prerequisiti Tauri per la piattaforma
  (vedi https://tauri.app/start/prerequisites/).
- Windows: WebView2 (preinstallato su Win11) + MSVC build tools.
- Linux: WebKitGTK 4.1 + libsoup3.
- macOS: Xcode command line tools.

Le decisioni tecniche e la giustificazione delle dipendenze sono in [NOTES.md](./NOTES.md).
