# NOTES — decisioni di progetto

Diario delle scelte tecniche e giustificazione di **ogni** dipendenza, come da brief.
Regola: dipendenze al minimo; ogni aggiunta deve essere motivata qui.

Nome in codice provvisorio: **Lume** (it. "lume" = luce/lampada — leggero, ti illumina
il codice accanto a Claude Code). Identifier bundle: `com.visialab.lume`.

---

## Gate del progetto (se cadono, ci si ferma)
1. **Leggerezza estrema** — RAM, CPU, dimensione binario al minimo.
2. **Dark mode curata** — livello IntelliJ / Visual Studio 2026.
3. **Cross-platform reale** — Windows, macOS, Linux.

---

## Stack
- **Tauri 2** (Rust + webview di sistema). NON Electron → niente Chromium bundle.
- **Svelte 5 + Vite + TypeScript** (NON SvelteKit, vedi sotto).
- **Tailwind v4** per i token del tema dark.
- **CodeMirror 6** come editor (NON Monaco).
- **xterm.js + portable-pty** per il terminale.
- **git2 (libgit2)** per git, **notify** per il file watcher.

---

## Milestone 1 — scaffold base

### Decisione: Svelte + Vite puro, NON SvelteKit
Lo scaffold ufficiale `create-tauri-app -t svelte-ts` genera un progetto **SvelteKit**
(router, SSR, adapter-static). Per il gate #1 (leggerezza) e dato che il brief dice
"Svelte + TypeScript" (non SvelteKit), ho sostituito il frontend con **Svelte 5 + Vite**
puro:
- nessun router/SSR: l'app è una singola finestra, non ha pagine navigabili;
- albero di dipendenze più piccolo (rimossi `@sveltejs/kit`, `@sveltejs/adapter-static`);
- pieno controllo su `index.html` e bundle.
Mantenuto invece lo scaffold Rust `src-tauri/` (corretto per Tauri 2).
Output frontend spostato da `../build` (Kit) a `../dist` (Vite) in `tauri.conf.json`.

### Decisione: Tailwind v4 con `@tailwindcss/vite`
- config CSS-first: i token vivono in `src/app.css` dentro `@theme { … }`, **zero**
  `tailwind.config.js`;
- plugin Vite ufficiale (`@tailwindcss/vite`), niente catena PostCSS separata;
- JIT: in produzione finiscono solo le utility effettivamente usate → CSS minimo.
I token definiscono la palette dark (superfici `surface-0..4`, `ink*`, `line*`, accento,
stati) usata da tutta la shell come fonte unica di verità.

### Decisione: rimosso `tauri-plugin-opener` / `@tauri-apps/plugin-opener`
Lo scaffold lo include per una demo "apri link". Non serve alla Definition of Done →
rimosso dal `Cargo.toml`, da `lib.rs` e dalle capability. Si potrà reintrodurre se
servirà "rivela nel file manager" / apertura link esterni.

### Decisione: profilo `release` Rust ottimizzato per dimensione
In `Cargo.toml` `[profile.release]`: `opt-level = "s"`, `lto = true`,
`codegen-units = 1`, `panic = "abort"`, `strip = true`. Build più lenta ma binario
più piccolo — coerente col gate #1.

### Dipendenze a fine milestone 1
Frontend (`package.json`):
- `@tauri-apps/api` — bridge IPC verso il backend Rust. **Necessaria.**
- dev: `svelte`, `@sveltejs/vite-plugin-svelte`, `vite`, `typescript`, `svelte-check`,
  `@tsconfig/svelte` — toolchain Svelte+TS. **Necessarie.**
- dev: `tailwindcss`, `@tailwindcss/vite` — tema (mandato dal brief). **Necessarie.**
- dev: `@tauri-apps/cli` — comando `tauri`. **Necessaria.**

Rust (`src-tauri/Cargo.toml`):
- `tauri` — framework. **Necessaria.**
- `serde`, `serde_json` — (de)serializzazione IPC. **Necessarie.**
- build: `tauri-build`. **Necessaria.**

---

## Milestone 2 — dark shell (gate estetico)

Layout a pannelli, modello VS Code/IntelliJ:
- **Activity bar** (48px, surface-0): switch vista sidebar (Esplora/Git/Cerca),
  toggle terminale, impostazioni. Indicatore accento sull'elemento attivo.
- **Sidebar** (surface-2, ridimensionabile 180–560px): header + corpo con empty-state.
- **Area editor** (surface-1): tab bar + superficie; senza file mostra il welcome
  (wordmark in gradiente, hint da tastiera).
- **Pannello terminale** (ridimensionabile 96–760px): header con tab + azioni.
- **Status bar** (24px, surface-0): ramo git, info file.

Decisioni:
- **Splitter custom** (pointer events, ~6px di presa, linea 1px, accento on hover)
  invece di una libreria di pannelli → zero dipendenze (gate #1).
- **Icone inline** (stile Lucide, 24x24, currentColor) in `Icon.svelte` → niente
  icon-font né sprite, niente dipendenze.
- **Stato reattivo** via runes in moduli `.svelte.ts` (`layout`, `workspace`) invece
  di store classici → parte di Svelte 5, API più semplice.
- **Titlebar nativa** (window `theme: Dark`) per ora: sicura cross-platform; una
  titlebar custom resta un possibile polish futuro.
- **Niente web font**: stack di sistema (`system-ui`/Segoe UI + monospace di sistema)
  → nessun download di font.

Footprint frontend a fine M2: JS ~50KB (19KB gz), CSS ~14KB (3.7KB gz).
Verifica visiva con screenshot della finestra reale (1280×800): shell pulita e scura.
**Nessuna dipendenza aggiunta in M2.**

---

## Milestone 3 — albero file + apertura file

Backend (Rust):
- `read_dir(path)`: legge UNA directory (lazy, non ricorsivo), dirs-first + ordine
  case-insensitive. Lazy + virtualizzazione UI = regge cartelle grandi senza walk totale.
- `read_file(path)`: legge testo UTF-8 (errore sui binari, gestito lato UI).
- `startup()`: cartella/file iniziali da `LUME_DIR`/`LUME_FILE` o primo arg CLI → si può
  lanciare `lume /percorso` (utile come companion) ed è anche il gancio per i test visivi.

Frontend:
- **Albero virtualizzato** (`Explorer.svelte`): windowing ad altezza fissa (riga 22px,
  overscan 8) — rende solo le righe nel viewport. Niente libreria di virtual-list.
- Espansione lazy delle cartelle (figli caricati al primo expand).
- Click su file → tab + contenuto (in M3 sola lettura in `<pre>`; M4 monta CodeMirror).
- Tab bar con file aperti, chiusura, indicatore dirty (predisposto per M4).
- Scorciatoie: Ctrl/Cmd+K apri cartella, Ctrl/Cmd+B sidebar, Ctrl/Cmd+\` terminale.

Dipendenza aggiunta:
- `tauri-plugin-dialog` (+ `@tauri-apps/plugin-dialog`): folder-picker nativo.
  **Giustificata**: serve un selettore cartella nativo cross-platform; è il plugin
  ufficiale Tauri (niente reinvenzione).

Footprint frontend a fine M3: JS ~57KB (21KB gz), CSS ~17KB (4.1KB gz).
Verifica visiva: aperto il progetto stesso, albero popolato, `NOTES.md` in tab.

---

## Milestone 4 — editor CodeMirror 6

- `Editor.svelte`: CodeMirror 6 assemblato a mano (state/view/commands/language) con
  numeri di riga, fold gutter, history (undo/redo), bracket matching, indent con Tab,
  riga attiva, selezione, auto-focus all'apertura.
- **Tema dark scritto a mano** (`editor/theme.ts`): `EditorView.theme` + `HighlightStyle`
  con palette VS Code Dark+. Niente theme-package esterno → più leggero e coerente.
- **Highlighting multi-linguaggio lazy**: `@codemirror/language-data` +
  `LanguageDescription.matchFilename` → la grammatica giusta è importata on-demand
  (code-split da Vite). All'avvio il bundle resta leggero; le grammatiche caricano solo
  all'apertura di un file di quel tipo (~140 linguaggi; totale misurato in M8).
- **Modifica + salvataggio**: l'updateListener marca dirty; Ctrl/Cmd+S → comando Rust
  `write_file`. I file binari/non-UTF8 si aprono in sola lettura (non sovrascrivibili).

Verifica end-to-end (reale): script che apre un file di test, clicca nell'editor, digita
via SendKeys e preme Ctrl+S → il contenuto risulta scritto su disco (`SAVE_OK`).
Highlighting verificato su `lib.rs` (Rust).

Dipendenze aggiunte (editor mandato dal brief; pacchetti CM6 modulari):
`@codemirror/state`, `/view`, `/commands`, `/language`, `/language-data`,
`@lezer/highlight`. **Giustificate**: nucleo CM6 + grammatiche lazy + tag per il tema.
Nessun theme-package (tema fatto in casa).

Limitazione nota: l'undo non è preservato cambiando tab (editor ricreato per file);
il contenuto non salvato sì. Accettabile per ora.

---

## Milestone 5 — pannello git (libgit2)

Backend (`git.rs`, crate git2 **senza default-features** → solo locale, no openssl/ssh):
- `git_status`: ramo corrente + file con codici index/worktree (M/A/D/R/T, U=untracked).
- `git_diff`: patch unificata (HEAD↔index se staged, index↔workdir altrimenti),
  con contenuto degli untracked.
- `git_stage`/`git_unstage`: `add_path`/`remove_path` · `reset_default` su HEAD.
- `git_commit`: `write_tree` → `commit` (firma da config repo, fallback). Gestisce il
  primo commit (HEAD unborn).
- `git_branches`/`git_checkout_branch`: rami locali · `checkout_tree` + `set_head`.

Frontend (`GitPanel.svelte`, `git.svelte.ts`, `DiffView.svelte`):
- Selettore ramo con dropdown + switch; pulsante refresh.
- Box messaggio + Commit (Ctrl+Invio); "Stage tutto"; stage/unstage per file.
- Click su file → tab diff di sola lettura colorata (add verde, del rosso, hunk accento).
- Il ramo corrente appare anche nella status bar.

libgit2 vendored compila con cc+MSVC (niente cmake). Verifica **end-to-end** su un repo
usa-e-getta: status/diff a schermo; stage+commit → nuovo commit in `git log` e albero
pulito; switch branch → HEAD passa da `main` a `feature`.

Dipendenza aggiunta: `git2` (`default-features = false`). **Giustificata**: mandata dal
brief per git; senza https/ssh evita openssl/libssh2 (servono solo operazioni locali).

---

## Milestone 6 — terminale integrato (PTY) + finestra flottante

Backend (`pty.rs`, crate portable-pty → ConPTY su Windows):
- `PtyManager` (State Tauri): mappa id→sessione (master, writer, child) sotto Mutex.
- `pty_spawn` (idempotente): apre un PTY, spawna la shell (PowerShell su Windows, `$SHELL`
  su Unix; override `LUME_SHELL`), cwd = workspace o `LUME_DIR`. Un thread legge l'output
  e lo emette come `pty-data-<id>` (byte in **base64**, accurato sui byte). All'uscita della
  shell → `pty-exit-<id>`.
- `pty_write` / `pty_resize` / `pty_kill`.

Frontend (`Terminal.svelte`, xterm.js + addon-fit):
- xterm con tema coerente; input → `pty_write`; output base64 → `term.write(bytes)`;
  ResizeObserver → fit + `pty_resize`. Prop `persistent`: il terminale del pannello
  sopravvive a hide/show senza uccidere la shell; quello flottante muore alla chiusura.
- **Finestra flottante always-on-top** creata da JS con `WebviewWindow` e
  `url = window.location.href` (robusto dev/prod; `WebviewUrl::App` dal lato Rust dava
  pagina bianca in dev). La finestra è rilevata via label `term-float` e mostra solo
  il terminale.

Verifica end-to-end: PowerShell reale nel pannello (prompt nella cartella di progetto),
`echo` digitato → output mostrato; finestra flottante aperta con terminale funzionante.
Ci si può lanciare `claude`.

Dipendenze aggiunte: `portable-pty` (PTY reale cross-platform), `base64` (streaming
byte-accurate), `@xterm/xterm` + `@xterm/addon-fit` (terminale, mandato dal brief).
Permessi capability aggiunti per la finestra flottante: `core:webview:allow-create-webview-window`,
`core:window:allow-set-focus`.

---

## Milestone 7 — file watcher (notify)

Backend (`watcher.rs`, crate notify):
- `watch_start(root)`: watcher ricorsivo sulla cartella; ignora gli eventi di solo accesso
  e i path in `node_modules`/`target`/`dist`/`.git` (riduce il rumore e, su Linux, il
  numero di watch inotify).
- Thread di **debounce** (~250ms): coalizza i burst in un solo evento `fs-changed`.
- Il watcher vive in uno State; aprire una nuova cartella lo sostituisce (e il thread
  precedente termina perché il sender cade).

Frontend:
- `openRoot` avvia il watch; App ascolta `fs-changed` → `refreshTree()` + `refreshStatus()`.
- `refreshTree` ricostruisce l'albero preservando le cartelle espanse.

Verifica end-to-end: con la cartella aperta e il pannello git visibile, creando un file
dall'esterno il pannello mostra il nuovo file come untracked **senza refresh manuale** e
l'albero lo elenca. Aggiornamento in tempo reale confermato.

Dipendenza aggiunta: `notify`. **Giustificata**: mandata dal brief per il file watcher.
Limitazione nota: su progetti enormi il watch ricorsivo inotify (Linux) potrebbe avvicinarsi
ai limiti di sistema; un watcher gitignore-aware selettivo è un'evoluzione possibile.

---

## Ambiente di sviluppo verificato
- Node 24, npm 11, Rust 1.92 (host `x86_64-pc-windows-msvc`).
- MSVC C++ tools + Windows SDK 26100 (Visual Studio Community 2026).
- WebView2 runtime 148 presente.
- Dev su **Windows**; il codice è scritto per essere cross-platform (vedi milestone
  finale per la nota sul build Linux/macOS, non testabile direttamente da qui).
