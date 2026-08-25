# NOTES — decisioni di progetto

Diario delle scelte tecniche e giustificazione di **ogni** dipendenza, come da brief.
Regola: dipendenze al minimo; ogni aggiunta deve essere motivata qui.

Nome in codice provvisorio: **Lume** (it. "lume" = luce/lampada — leggero, ti illumina
il codice accanto a Claude Code). Identifier bundle: `com.visialab.lume`.
> Nota: il progetto è poi stato rinominato **Orbit** (M25). L'identifier bundle e le env var
> `LUME_*` restano invariati di proposito (per non orfanizzare sessioni/impostazioni installate).

---

## Indice
- [Gate del progetto](#gate-del-progetto-se-cadono-ci-si-ferma) · [Stack](#stack)
- Milestone [1](#milestone-1--scaffold-base) · [2](#milestone-2--dark-shell-gate-estetico) · [3](#milestone-3--albero-file--apertura-file) · [4](#milestone-4--editor-codemirror-6) · [5](#milestone-5--pannello-git-libgit2) · [6](#milestone-6--terminale-integrato-pty--finestra-flottante) · [7](#milestone-7--file-watcher-notify) · [8](#milestone-8--footprint-e-verifica-dei-gate)
- [Restyling UI](#restyling-ui-richiesta-utente) · [Estensioni](#estensioni-post-base-su-richiesta)
- Milestone [9](#milestone-9--produttività-gestione-file-persistenza-findreplace-quick-open) · [10](#milestone-10--terminali-multipli) · [11](#milestone-11--git-discard--cronologia) · [12](#milestone-12--startup-lazy--decorazioni-git-companion) · [13](#milestone-13--configurazioni-di-esecuzione-esegui--loop-con-claude) · [14](#milestone-14--selettore-branch-status-bar--istanze-multiple--distribuzione) · [15](#milestone-15--scaffale-cartelle-messe-da-parte-per-categoria) · [16](#milestone-16--rifinitura-grafica-ide--terminale) · [17](#milestone-17--polish-grafico-2-diff-toast-focus-title-bar-tab) · [18](#milestone-18--impostazioni-font-cursore-fluido-uireadme-in-inglese) · [19](#milestone-19--zoom-font-vs-look-visual-studio-2026) · [20](#milestone-20--verso-il-look-visual-studio-git-gutter-card-densità) · [21](#milestone-21--indagine-footprint--webgl-opt-in) · [22](#milestone-22--manutenzione-doc-pulizia-repo-refactor) · [23](#milestone-23--più-linguaggi--esperienza-markdowndocs) · [24](#milestone-24--integrazione-claude-code) · [25](#milestone-25--refactor--pulizia-pre-release) · [26](#milestone-26--split-view-riquadri-editor-affiancati) · [27](#milestone-27--rifiniture-split-view--terminale-flottante) · [28](#milestone-28--revisione-pre-release-v020) · [29](#milestone-29--git-completo-vai-al-simbolo-chat-claude-v030) · [30](#milestone-30--viewer-immagini-e-pdf-drop-file-menu-contestuali-multi-detach-v031) · [31](#milestone-31--titolo-finestra-wrapper-claude-open-with-menu-a-sezioni-v032) · [32](#milestone-32--temi-glifi-file-per-linguaggio-notifica-claude-trim-davvio-v040) · [33](#milestone-33--la-finestra-ricorda-posizione-e-dimensione) · [34](#milestone-34--navigazione-del-codice-scorciatoie-configurabili-esegui-script) · [35](#milestone-35--segui-il-file-attivo-badge--pin-del-terminale-flottante-v050) · [36](#milestone-36--finestre-multiple-chiudi-tutte-e-riapri-tutte-c) · [37](#milestone-37--selettore-repo-in-top-bar-più-cartelle-aperte-una-attiva-v060) · [38](#milestone-38--autosave-quick-prompt-keymap-custom-default-markdown-nav-indietroavanti-highlight-semantico-cc-v070) · [39](#milestone-39--multi-finestra--multi-cartella-lista-repo-e-sessioni-per-finestra-v071) · [40](#milestone-40--scaffale-regole-per-nome-rifiniture-top-bar-e-salto-riga-v072) · [41](#milestone-41--perf-terminale-robustezza-e-rete-di-test-v073) · [42](#milestone-42--topbar-uniforme-e-revisione-notifica-claude-v074) · [43](#milestone-43--vista-attività-unità-di-lavoro-dai-transcript-claude-v080)
- [Ambiente di sviluppo verificato](#ambiente-di-sviluppo-verificato)

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

## Milestone 8 — footprint e verifica dei gate

Build **release** size-optimized (`opt-level=s`, LTO, `codegen-units=1`, `panic=abort`,
`strip`) completato in ~1m40s.

Footprint misurato (Windows, app a riposo, schermata di benvenuto):
- **Binario `lume.exe`: 4,88 MB** (un'app Electron equivalente sarebbe ~80–200 MB).
- Frontend `dist/`: 1,93 MB (incluse tutte le grammatiche CodeMirror caricate lazy).
- **RAM a riposo — working set PRIVATO (RAM reale, senza doppio conteggio):**
  - core Rust `lume.exe`: **~4,5 MB** privati (~25 MB working set)
  - WebView2 (6 processi): **~97 MB** privati (~345 MB di working set *lordo*, ma il
    lordo conta più volte le pagine Chromium condivise → il privato è il dato onesto)
  - **≈ 101 MB** app + webview · **≈ 127 MB** includendo la shell PowerShell del terminale.

### Verifica dei gate
1. **Leggerezza estrema** ✓ — binario 4,88 MB e RAM reale ~100 MB: nettamente sotto
   VS Code (300–800 MB) e IntelliJ (1–2 GB). Il costo dominante è il runtime WebView2 di
   sistema, inerente a qualunque UI webview (è il compromesso di Tauri: binario minuscolo,
   nessun Chromium nel bundle).
2. **Dark mode curata** ✓ — verificata con screenshot reali a ogni milestone (shell, albero,
   editor con highlighting, pannello git con diff, terminale).
3. **Cross-platform** ⚠️ — codice cross-platform *per costruzione* (Tauri 2 + crate standard;
   le uniche parti platform-specific sono cfg-gated: shell di default, separatori di path).
   **Verificato end-to-end solo su Windows.** Linux/macOS **non** verificati da questo
   ambiente: per Linux servono WebKitGTK 4.1 + libsoup3 e un build sulla piattaforma (o CI).
   Questo è l'unico punto non provato empiricamente — lo segnalo apertamente, come da
   criterio di accettazione (onestà prima della teoria).

### Conclusione
La base è **funzionante e bella**, e regge i gate di leggerezza ed estetica su Windows.
Tutti i punti della Definition of Done sono implementati e verificati end-to-end (con
screenshot e test reali). Unico residuo: un build di validazione su Linux/macOS, non
eseguibile da Windows.

---

## Restyling UI (richiesta utente)

- **Title bar custom integrata** (window `decorations: false`, `shadow: true`): in alto
  logo gradiente + switch viste (Esplora/Git/Cerca) + toggle terminale + nome workspace e
  ramo al centro + azioni (apri cartella, impostazioni) + **controlli finestra**
  (minimizza / massimizza-ripristina / chiudi via API Tauri `getCurrentWindow`, con i
  relativi permessi in capability). **Rimossa la activity bar sinistra** → più spazio
  orizzontale. Trascinamento finestra via `data-tauri-drag-region`.
- **Icone file colorate** per estensione/nome (`fileIcon` in `util.ts`): glifo + colore
  brand (ts blu, js/json giallo, rust arancio, svelte/html "code" arancio, css blu, md
  "doc" blu, git arancio, lock, gear per i config, image, ecc.). Inline SVG, zero dipendenze.
- **Palette rifinita** (ispirata a IntelliJ new UI / Visual Studio 2022-2026): superfici più
  morbide, accento blu vivo + secondo accento viola per i gradienti (logo e wordmark), bordi
  a basso contrasto, token per raggi e ombre.
- La finestra flottante del terminale mantiene il chrome nativo (decorations di default).

Verifica: screenshot reali (top bar + albero con icone colorate + editor con highlighting);
controlli finestra testati (massimizza/ripristina funzionano).

### Iterazione 2 — verso Visual Studio 2026
- Palette ridisegnata sui **grigi neutri di VS** (editor `#1e1e1e`, pannelli `#252526`,
  chrome `#2d2d30` più chiaro dell'editor) + accento **blu VS** `#3b9dff`.
- **Terminale docked a destra** (non più in basso): layout a 3 colonne
  sidebar | editor | terminale, con `terminalWidth` nello stato e splitter verticale.
- **Solo logo nella barra** (rimosso il wordmark testuale): nuovo mark `>_`
  (`Logo.svelte`, quadrato con gradiente). Nome prodotto provvisorio **Caret** (cursore di
  testo); il nome interno del pacchetto resta `lume` per non rompere build/script.

### Iterazione 3 — tipografia
Font **self-hosted** (via `@fontsource-variable`, niente CDN): **Inter** (interfaccia) +
**JetBrains Mono** (editor e terminale), al posto di Segoe UI/Consolas di sistema (che non
piacevano). +~296 KB di woff2 nel bundle; a runtime si carica solo il subset latin grazie a
`unicode-range`. Importati in `main.ts`, applicati via i token `--font-sans`/`--font-mono`
(e nel `fontFamily` di xterm).

---

## Estensioni (post-base, su richiesta)

- **Auto-reload dei file aperti**: quando il watcher segnala una modifica, le tab aperte
  *non sporche* vengono ricaricate dal disco (l'editor rimpiazza il doc con una transaction,
  preservando la vista e senza marcare dirty — flag `applyingExternal`). Con edit non salvati
  niente overwrite: la tab mostra un indicatore di conflitto (pallino arancio). Chiave per il
  flusso con Claude Code: i file che `claude` modifica si aggiornano da soli nell'editor.
- **Ricerca nel progetto** (vista Cerca): comando Rust `search_in_project` (walk manuale con
  esclusioni node_modules/.git/target/dist, substring case-insensitive, salta binari/file
  grandi, cap sui risultati — **nessuna dipendenza nuova**). `SearchView`: match raggruppati
  per file con numero di riga ed evidenziazione; click → apre il file alla riga
  (`openFileAt` → goto nell'editor). `LUME_SEARCH` apre all'avvio con una query.
- **Icona app = logo Orbit**: PNG 1024 generato con System.Drawing e set icone rigenerato
  con `tauri icon` (desktop + mobile), al posto delle icone default di Tauri.

Verifiche reali: auto-reload (riga appesa dall'esterno → comparsa nell'editor, tab non
sporca); ricerca (`terminalWidth` → 4 risultati in 3 file con evidenziazione); icona generata.

---

## Milestone 9 — produttività (gestione file, persistenza, find/replace, quick-open)

Primo gruppo di "table-stakes" per l'uso quotidiano dell'IDE.

### Gestione file dall'albero
Backend (`lib.rs`, solo `std::fs`, **zero dipendenze**): `create_file` (errore se
esiste, crea i genitori), `create_dir`, `rename_path` (rifiuta se la destinazione
esiste), `delete_path` (file o cartella ricorsiva).
Frontend: menu contestuale riusabile (`ContextMenu.svelte`) sull'albero (tasto destro
su file/cartella o su area vuota = radice) con **Nuovo file/cartella, Rinomina, Elimina,
Copia percorso**; più i pulsanti nuovo-file/nuova-cartella nell'header della vista Esplora.
Crea/rinomina avvengono con **input inline** dentro l'albero (la riga di input è iniettata
nella lista virtuale dopo la cartella target, così la virtualizzazione resta coerente).
L'eliminazione chiede conferma (dialog nativo) e chiude le tab interessate; il rename
riallinea i percorsi delle tab aperte (anche per i file sotto una cartella rinominata).
L'albero e lo stato git si aggiornano da soli (file watcher) e vengono comunque
rinfrescati subito. Eliminazione **definitiva** (non nel cestino): un crate `trash` è una
possibile evoluzione di sicurezza, per ora evitato per il gate dipendenze.
Permesso capability aggiunto: `dialog:allow-confirm` (conferma eliminazione).

### Persistenza di sessione
Backend: `save_state`/`load_state` scrivono un blob JSON in `app_config_dir()/session.json`
(via `tauri::Manager::path()`, **zero dipendenze**). Il frontend (`persist.svelte.ts`)
serializza ultima cartella, tab aperte, tab attiva e stato pannelli (vista sidebar,
visibilità e larghezze di sidebar/terminale). `startAutosave()` salva in modo **debounced**
(400ms) via un `$effect.root` che traccia i campi reattivi; il ripristino avviene all'avvio
solo se non c'è un avvio esplicito (`LUME_DIR`/arg CLI vincono). Il file di sessione vive
fuori dalla cartella di progetto → nessun loop col watcher.

### Find/replace nell'editor
Cablato `@codemirror/search` in `Editor.svelte` (`search({top:true})`,
`highlightSelectionMatches()`, `...searchKeymap`): **Ctrl+F** apre il pannello cerca,
con sostituzione, regex e match-case. Pannello stilizzato a tema scuro in `editor/theme.ts`
(`.cm-panels`, `.cm-textfield`, `.cm-button`). Prima Ctrl+F non faceva nulla.

### Quick-open (Ctrl+P)
Backend: `list_files` (stesso walk/esclusioni della ricerca, cap 20000, **zero dipendenze**).
Frontend: `quickopen.svelte.ts` (ranking fuzzy: substring nel nome file > nel path >
sottosequenza) + `QuickOpen.svelte` (overlay con input, navigazione frecce/Invio/Esc).
**Ctrl+P** apre la palette; l'elenco file è caricato all'apertura.

### Dipendenze e verifica
Unica dipendenza aggiunta: **`@codemirror/search`** (feature editor, in linea col brief;
nucleo CM6 già presente). Footprint frontend invariato a parte questo pacchetto.
Verifica: `svelte-check` 0 errori/0 warning; `cargo check` pulito; **`cargo test` — 8 unit
test** (primi test automatici del progetto) sui comandi filesystem/ricerca, ognuno in una
cartella temporanea isolata, tutti verdi. La verifica end-to-end runtime (stile delle
milestone precedenti, con `npm run tauri dev`) resta il passo successivo consigliato.

---

## Milestone 10 — terminali multipli

Tab multiple nel pannello terminale, con scelta della shell (utile come companion:
una shell con `claude` in esecuzione, un'altra libera per i comandi).

Backend (`pty.rs`, **zero dipendenze**):
- `pty_spawn` ora accetta una `shell` opzionale (override del programma); senza, usa il
  default di piattaforma (`LUME_SHELL`/PowerShell/`$SHELL`).
- `list_shells`: rileva le shell **effettivamente presenti** sul sistema (Windows:
  PowerShell, pwsh, cmd, Git Bash, WSL; Unix: `$SHELL` + bash/zsh/fish/sh) con probe di
  esistenza. Helper `which` (Windows) e `shell_label` (Unix) cfg-gated per non lasciare
  codice morto sull'altra piattaforma.

Frontend:
- `terminals.svelte.ts`: stato con lista tab + tab attiva; `addTerminal(shell?)`,
  `closeTerminal` (uccide il PTY), `ensureTerminal`.
- `TerminalPanel`: barra con tab (titolo + chiudi), pulsante **+** (terminale default) e
  **caret** che apre il selettore shell (riusa `ContextMenu`). I terminali restano **tutti
  montati**, con sola visibilità CSS → scrollback e shell si conservano cambiando tab.
- `Terminal`: nuove prop `shell` e `active` (al diventare attivo rifit + focus) + guard che
  non ridimensiona il PTY quando la tab è nascosta (dimensioni nulle). Chiudendo l'ultima
  tab il pannello si nasconde; riaprendolo (Ctrl+`) se ne crea una nuova. La finestra
  flottante resta un singolo terminale.

Verifica: `svelte-check` 0/0; `cargo check` pulito. Runtime end-to-end (più tab, switch,
shell diverse) da provare con `npm run tauri dev`.

---

## Milestone 11 — git: discard + cronologia

Completa il pannello git locale con due flussi utili rivedendo ciò che Claude modifica.

Backend (`git.rs`, crate `git2` già presente, **zero dipendenze nuove**):
- `git_discard`: annulla le modifiche di un file. Untracked → eliminato dal disco (HEAD non
  lo conosce); tracciato → riportato a HEAD via `checkout_head` con `CheckoutBuilder::force()`
  sul pathspec (ripristina workdir + index). Distruttivo → conferma lato UI.
- `git_log`: cronologia da HEAD (revwalk, `Sort::TIME`, cap 100), ritorna id/short/summary/
  author/time. HEAD unborn → lista vuota.
- `git_show`: patch di un commit vs primo genitore (`diff_tree_to_tree`), stesso formato di
  `git_diff`, per la vista di dettaglio.

Frontend:
- `git.svelte.ts`: stato `view` (changes/history) + `log`; azioni `discardFile` (con dialog
  di conferma), `loadLog`, `setView`, `showCommit`.
- `GitPanel.svelte`: toggle **Modifiche / Cronologia**; nelle modifiche ogni file ha ora il
  pulsante **annulla** (cestino) oltre allo stage; la cronologia elenca i commit (short id
  accento, summary, autore + tempo relativo via `relativeTime` in `util.ts`) e al click apre
  il diff del commit in una tab di sola lettura (riusa `openDiff`/`DiffView`).
- Il pulsante refresh è contestuale alla vista attiva.

Restano fuori (come da gate): operazioni remote (push/pull/fetch) — `git2` è senza
https/ssh, solo locale.

Verifica: `svelte-check` 0/0; `cargo check` pulito. Runtime end-to-end (discard di un file,
sfoglia cronologia, apri diff di un commit) da provare con `npm run tauri dev`.

---

## Milestone 12 — startup lazy + decorazioni git (companion)

Due interventi: alleggerire il primo paint e rendere visibile a colpo d'occhio cosa cambia
sul disco (i file che Claude tocca).

### Ottimizzazione startup (lazy xterm + CodeMirror)
Il chunk d'ingresso bundlava eager Svelte app + **CodeMirror** + **xterm** (797 KB).
Introdotti due wrapper, `LazyEditor.svelte` e `LazyTerminal.svelte`, che fanno
`import()` dinamico del componente pesante; usati da `EditorArea`, `TerminalPanel` e dal
terminale flottante in `App`. `DiffView` è puro (nessun CM) e resta com'è.

Risultato **misurato** (`npm run build`):
- chunk d'ingresso **797 KB → 117 KB** (gzip 242 KB → 40 KB, **−85%**);
- `Editor-*.js` (~354 KB, CodeMirror) caricato solo all'apertura del primo file — la welcome
  non lo carica affatto;
- `Terminal-*.js` (~328 KB, xterm) caricato quando il pannello/finestra terminale monta
  (async, non blocca il primo paint);
- totale `dist/` invariato (2,29 MB): cambia *cosa* si carica all'avvio, non *quanto*.

### Decorazioni git nell'albero + badge (companion-Claude)
- `decorations()` (in `git.svelte.ts`) costruisce la mappa path→codice dei file modificati
  e l'insieme delle cartelle che li contengono. `Explorer` colora il nome dei file con il
  codice git (M giallo, U/A verde, D rosso) + lettera a destra, e mette un pallino sulle
  cartelle che contengono modifiche. Aggiornate **live dal watcher**: quando Claude modifica
  file nel terminale, l'albero si illumina da solo.
- `refreshStatus()` è ora invocato all'apertura della cartella (`openRoot`), così le
  decorazioni compaiono senza dover aprire il pannello Git.
- Badge col numero di file modificati sul pulsante **Git** della top bar (ingresso rapido
  alla review).
- Limite noto: se si apre una **sottocartella** di un repo (non la root), i path relativi di
  git potrebbero non combaciare con quelli dell'albero → decorazioni assenti per quei file.

Verifica: `svelte-check` 0/0; build misurato. Runtime end-to-end (welcome senza CM, terminale
async, albero che si illumina alle modifiche) da provare con `npm run tauri dev`.

---

## Milestone 13 — configurazioni di esecuzione ("Esegui ▶", loop con Claude)

Pulsante **Esegui** stile IntelliJ: comandi lanciabili con un click, **creati da Claude
Code**. Il cerchio si chiude perché l'IDE documenta il formato in un file che Claude legge
da solo. Decisioni utente: insegnare via **CLAUDE.md**, config in **`.orbit/run.json`**,
esecuzione in **tab del terminale**.

Formato (`.orbit/run.json`):
```json
{ "configurations": [ { "name": "Dev", "command": "npm run dev", "cwd": "." } ] }
```

- **Lettura** (`run.svelte.ts`): legge `.orbit/run.json` via `read_file`; ricaricato
  all'apertura cartella (`openRoot`) e **live dal watcher** (`.orbit` non è escluso) → quando
  Claude modifica il file, il menu si aggiorna da solo. Voci invalide scartate.
- **Esecuzione** (`runConfig`): apre una nuova **tab terminale** col nome della config e ci
  invia il comando. Modello terminali esteso (`NewTerminal`: shell/title/cwd/initCommand);
  `Terminal` invia `initCommand` **una sola volta** dopo lo spawn (flag `started` sul
  TermSession → niente ri-esecuzione al remount del pannello). `cwd` per-terminale.
- **UI**: pulsante play (verde) nella top bar → menu (`ContextMenu`) con le config + azioni
  "Apri .orbit/run.json" e "Prepara per Claude (CLAUDE.md)".
- **Insegna a Claude** (`teachClaude`): crea `.orbit/run.json` se manca e appende una sezione
  a `CLAUDE.md` (marker `orbit:run-config`, idempotente) che spiega lo schema. Da lì Claude
  Code sa creare/aggiornare le run config su richiesta dell'utente.

**Zero dipendenze nuove e zero comandi Rust nuovi** (riusa `read_file`/`write_file`/
`create_dir`). Seedato `.orbit/run.json` di questo repo come demo (Dev/Build/Check/Test).

Verifica: `svelte-check` 0/0 (nessuna modifica Rust). Runtime end-to-end (click play → tab
con comando in esecuzione; "Prepara per Claude" → sezione in CLAUDE.md) da provare con
`npm run tauri dev`.

---

## Milestone 14 — selettore branch (status bar) + istanze multiple + distribuzione

### Selettore branch nella status bar (stile VS Code)
Il ramo in basso a sinistra è ora **cliccabile**: apre un popup (verso l'alto) con l'elenco
dei branch locali (`loadBranches`), cambio ramo (`checkout`) e **crea+switch** di un nuovo
branch. Backend `git_create_branch` (crea da HEAD via `repo.branch` + checkout). Resta
disponibile anche il selettore nel pannello Git.

### Istanze multiple (entrambe le modalità richieste)
- `open_new_window` (Rust): lancia una **nuova istanza** (nuovo processo) di `current_exe`,
  con una cartella opzionale come argomento CLI. Nessun blocco single-instance → avviare
  l'eseguibile più volte apre istanze indipendenti.
- Pulsante **Nuova finestra** nella top bar → folder picker → nuova istanza su quella cartella.
- **Sessioni per-cartella**: `save_state`/`load_state` ora sono *keyed* (file
  `sessions/<hash-della-cartella>.json`) + puntatore `last_session.txt`. Così due istanze su
  progetti diversi **non si sovrascrivono** la sessione. Avvio con cartella (arg) → ripristina
  la sessione di quella cartella, o la apre fresca; avvio "nudo" → ripristina l'ultima usata.
  (La vecchia `session.json` globale viene ignorata → un reset una-tantum della sessione.)
- Nota dev: in `tauri dev` una nuova istanza carica `localhost:1420` (serve il dev server
  attivo); nel portable/installer gli asset sono embedded → funziona standalone.

### Distribuzione (installer + portable)
`npm run tauri build` (size-optimized) produce:
- **Portable**: `src-tauri/target/release/lume.exe` — **~5,2 MB**, standalone (richiede WebView2,
  preinstallato su Win11).
- **Installer MSI**: `.../bundle/msi/Orbit_0.1.0_x64_en-US.msi` — ~3,7 MB.
- **Installer NSIS**: `.../bundle/nsis/Orbit_0.1.0_x64-setup.exe` — ~2,5 MB.

Zero dipendenze nuove. Verifica: `svelte-check` 0/0; `cargo check` pulito.

---

## Milestone 15 — "Scaffale": cartelle messe da parte per categoria

Orbit mostra tutto l'albero (a differenza di VS che vede solo la "soluzione"); lo Scaffale è
il complemento opt-in per togliere il rumore senza perderlo. Decisioni utente: **sezione in
fondo all'Esplora**, cartelle marcate **raggruppate in fondo** (rimosse dall'albero
principale), **sfogliabili inline** con un mini-albero.

- **Marcatura**: tasto destro su una cartella → "Metti nello scaffale…" → `ShelfPicker`
  (popup) per assegnare/togliere **una o più categorie** o crearne di nuove. Una cartella può
  stare in più categorie.
- **Stato** (`shelf.svelte.ts`): mappa `relPath → [categorie]`; `relOf`/`isHidden`,
  `shelveFolder`/`unshelve*`, `byCategory`. Persistito in **`.orbit/shelf.json`**
  (per-progetto, committabile, modificabile anche da Claude). Riusa `read_file`/`write_file`/
  `create_dir`; ricaricato all'apertura cartella e **live dal watcher**.
- **Albero pulito**: l'Esplora filtra le cartelle nello scaffale (e i loro discendenti).
- **Sezione Scaffale** (in fondo all'Esplora): categorie comprimibili → cartelle; cliccando
  una cartella si apre un **mini-albero inline** (`MiniTree.svelte`, ricorsivo e lazy) per
  navigarne i file senza sporcare l'albero. Tasto destro su una voce → di nuovo il picker
  (ricategorizza / togli).
- **Scorciatoia**: tasto destro sull'area vuota → "Metti via cartelle rumore"
  (`node_modules`, `target`, `dist`, `.git`) nella categoria *Generato* con un click.

**Zero dipendenze e zero comandi Rust nuovi.** Verifica: `svelte-check` 0/0; HMR applicato in
dev senza errori. Runtime end-to-end (marca → sparisce dall'albero e compare in fondo → sfoglia
inline → togli) da confermare nell'uso.

---

## Milestone 16 — rifinitura grafica (IDE + terminale)

Quattro gruppi di miglioramenti estetici, a gate invariati.

### IDE — polish
- **Status bar reale**: i valori finti (`Spazi: 2 · UTF-8 · LF · Testo semplice`) sono
  sostituiti da dati veri — **Ln/Col** del cursore (l'editor li riporta via `onCursor` →
  `editorStatus`), **linguaggio** (`langLabel`), **fine-riga** (LF/CRLF dal contenuto), UTF-8.
- **Barra-accento a sinistra** sulla riga attiva dell'albero (`box-shadow inset`).
- **Micro-transizioni**: `scale` sui menu (`ContextMenu`, `ShelfPicker`), `fade` su quick-open
  e popup branch; transizione di sfondo sulle righe dell'albero. (`svelte/transition`, zero dip.)

### Editor — leggibilità
- **Indent guides** custom (`editor/indentGuides.ts`): un `ViewPlugin` che disegna righe
  verticali di indentazione via background ritagliato, **zero dipendenze** (niente plugin
  esterni).
- **Breadcrumb** del file aperto sopra l'editor (percorso relativo a segmenti, con icona).

### Terminale — companion
- **Percorsi cliccabili**: `registerLinkProvider` rileva token tipo `src/App.svelte:12`
  nell'output e li rende cliccabili → apre il file alla riga. Quando Claude scrive "ho
  modificato X", ci clicchi e lo apri. (Disattivato nel terminale flottante, che non ha editor.)

### Terminale — resa & coerenza
- **Renderer WebGL** (`@xterm/addon-webgl`): testo più nitido e veloce; `try/catch` con
  fallback automatico al renderer DOM se la GPU/webview non lo supporta.
- **Palette ANSI** allineata alla sintassi dell'editor e **sfondo = editor `#1e1e1e`** (prima
  `#14171c`, scollegato).
- **Icona shell colorata per tab** (PowerShell blu, cmd grigio, bash/git verde, WSL viola).

**Dipendenza aggiunta**: `@xterm/addon-webgl@^0.19` (la 0.18 ha peer su xterm 5 → conflitto con
xterm 6; la 0.19 non ha vincoli di peer). Unica dip della milestone.

Verifica: `svelte-check` 161 file 0/0; HMR in dev ok (Vite ha ottimizzato la nuova dip e
ricaricato). Runtime end-to-end (guide visibili, breadcrumb, status bar viva, path cliccabili,
testo WebGL nitido) da confermare nell'uso.

---

## Milestone 17 — polish grafico 2 (diff, toast, focus, title bar, tab)

Due gruppi scelti dall'utente. **Zero dipendenze** (tutto Svelte/CSS).

### DiffView + Toast
- **DiffView** con **numeri di riga** e marcatori **+/−**: parsing del diff unificato con
  tracking dei contatori dai marcatori `@@`; intestazioni hunk/meta distinte. Prima erano
  righe colorate senza numeri.
- **Toast** (`toast.svelte.ts` + `Toaster.svelte`): notifiche non invasive in basso a destra,
  auto-dismiss, con `svelte/transition`. Collegate a: salvataggio (conferma breve), errori di
  salvataggio/eliminazione/annullamento (prima andavano solo in console).

### Focus + title bar + tab
- **Bordo-accento sul pannello a fuoco**: stato `layout.focusPanel` + `setFocusPanel`,
  impostato su `pointerdown` in sidebar/editor/terminale → filo accento (inset top 2px) sul
  pannello attivo.
- **Title bar inattiva**: il chrome si attenua quando la finestra perde il focus
  (`win.onFocusChanged`); i controlli finestra restano pieni.
- **Indicatore tab scorrevole**: una barra accento unica che scorre sotto la tab attiva
  (misura `offsetLeft`/`offsetWidth`, transizione su transform/width); rimosso il vecchio
  bordo per-tab.
- **Chiusura tab non salvata**: conferma (dialog) prima di chiudere una tab con modifiche.

Verifica: `svelte-check` 163 file 0/0; HMR in dev ok.

---

## Milestone 18 — impostazioni, font, cursore fluido, UI/README in inglese

### Cursore fluido
Caret dell'editor animato: la transizione è pilotata dalla variabile CSS `--caret-transition`
sul `.cm-cursor` (toggle nelle Impostazioni). Nel **terminale non è fattibile**: xterm disegna
il cursore su canvas/WebGL, non c'è un elemento DOM da animare.

### Pannello Impostazioni
`settings.svelte.ts` + `Settings.svelte` (il bottone ingranaggio ora è attivo):
- **Font editor/terminale** da lista curata (JetBrains Mono, Cascadia Code, Fira Code, Consolas,
  Source Code Pro, Menlo/Monaco), **dimensione** (11–20), **preset accento** (blu/viola/verde/
  teal), **toggle cursore fluido**.
- Applicati come variabili CSS sul documento (`--font-mono`, `--editor-font-size`,
  `--color-accent`/`--accent-rgb`/`--color-accent-2`, `--caret-transition`); l'editor re-misura
  la geometria al cambio, il terminale aggiorna `fontFamily`/`fontSize` di xterm e rifa il fit.
- **Persistenza in `localStorage`** (app-global, anche per la finestra flottante): niente
  comando Rust nuovo e nessun conflitto con la sessione per-cartella.

Nota font: Orbit usa **Inter + JetBrains Mono** (= IntelliJ); Visual Studio usa Cascadia Code +
Segoe UI (Cascadia ora selezionabile).

### Interfaccia e README in inglese
Tutta la UI è stata tradotta in **inglese** (~20 componenti: label, tooltip, menu, toast,
empty-state, conferme, placeholder). Il **README** è stato riscritto in inglese e curato
(filosofia, gate, stack con motivazioni, feature, footprint, scorciatoie, build/test).
Per scelta dell'utente, **CLAUDE.md, NOTES.md e i commenti del codice restano in italiano**.

Nessuna dipendenza nuova. Verifica: `svelte-check` 165 file 0/0; HMR in dev ok.

---

## Milestone 19 — zoom, font VS, look Visual Studio 2026

- **Ctrl + rotella = zoom**: `nudgeFontSize` varia la dimensione del font di editor e
  terminale (range 10–24, persistito). Listener `wheel` **non-passive** in `App.svelte` per
  intercettare l'evento prima dello zoom-pagina del WebView (`preventDefault` solo con Ctrl).
- **Cascadia Mono (Visual Studio)** aggiunto ai font selezionabili (Cascadia Code c'era già: è
  la stessa famiglia; Mono è il default esatto di VS, senza legature). Slider font ora 10–24.
- **Barra superiore più stretta** (38 → **30px**, stile VS 2026): view 23px, logo 18px,
  controlli finestra 44px — meno spazio sprecato.
- **Layout a pannelli arrotondati** (look Visual Studio 2026): `.body` ha uno sfondo base
  (`--color-bg` `#16181d`, = colore finestra) e padding 6px; Sidebar/Editor/Terminale diventano
  **card** con `border-radius: 8px` + `overflow: hidden`; gli **splitter** sono resi trasparenti
  (6px) e fanno da gap tra le card, con grip accento all'hover. Meno "flush" rispetto al look
  VS Code precedente.

Nessuna dipendenza nuova. Verifica: `svelte-check` 165 file 0/0; HMR in dev ok.

---

## Milestone 20 — verso il look Visual Studio (git gutter, card, densità)

- **Card più definite**: bordo 1px sui pannelli (sidebar/editor/terminale) sullo sfondo base
  → i pannelli leggono come superfici distinte, non rettangoli piatti.
- **Git nel gutter dell'editor** (`editor/gitGutter.ts`): un `gutter` CodeMirror con
  `GutterMarker` per riga **aggiunta/modificata/eliminata** (barre verde/blu/rosso). I
  marcatori sono calcolati da `parseGitMarks` sul diff unificato (`git_diff`) e ricaricati
  quando `git.tick` cambia (incrementato a ogni `refreshStatus` → su save/refresh/modifica
  esterna, anche quando Claude tocca i file).
- **Densità**: tab bar 36→32, header sidebar/terminale 35/34→30, status bar 24→22 (più
  compatto, stile VS).

Rimandati (per qualità, da fare come passi dedicati):
- **Parentesi colorate** (rainbow): vanno fatte *syntax-aware* (saltare stringhe/commenti via
  syntax tree) per non colorare parentesi dentro le stringhe. La palette di sintassi è invece
  già VS Code Dark+ (la stessa di Visual Studio).
- **Overview nella scrollbar** (marcatori git lungo la scrollbar): CM6 non ha un overview-ruler
  nativo → serve un overlay custom.
- **Trasparenza Mica/acrylic** (Win11): tocca finestra + Rust + trasparenza del WebView, da
  verificare con un build reale.

Verifica: `svelte-check` 166 file 0/0; HMR ok.

---

## Milestone 21 — indagine footprint + WebGL opt-in

Misure reali sul **build release** (processi isolati per albero, private bytes = RAM reale):
- **Core Rust** `lume.exe`: **~6 MB** private, **CPU a riposo ~0,07%** (nessun loop).
- **WebView2** (Chromium, 6 processi nostri):
  - pavimento (cartella vuota): **238 MB** con WebGL / **206 MB** senza.
  - progetto aperto: **310 MB** con WebGL / **225 MB** senza.
- Bundle chunk "Terminal": **439 KB** con WebGL / **329 KB** senza.

Conclusioni:
- Il nostro codice è leggerissimo; il peso è **Chromium/WebView2** (inerente a un IDE su webview)
  **+ il renderer WebGL**. ~206 MB è già vicino al pavimento di WebView2 → oltre WebGL non c'è
  molto da raschiare senza lasciare il modello webview.
- **WebGL reso opt-in, default OFF** (`settings.webgl`), caricato via **import dinamico**
  (`await import("@xterm/addon-webgl")`) solo se attivo → di default non pesa né sulla RAM
  (~−85 MB sotto carico) né sul bundle (~−110 KB). Toggle nel pannello Settings.

Persistenza preferenze (verificata): **impostazioni** in `localStorage` (chiave `orbit.settings`,
per-origine del WebView → dev e app installata hanno store separati; l'app installata è coerente
tra i riavvii); **sessione** in `%APPDATA%/com.visialab.lume/sessions/*.json`. Entrambe
sopravvivono a riavvio app e PC.

Verifica: `svelte-check` 166 file 0/0.

---

## Milestone 22 — manutenzione: doc, pulizia repo, refactor

Passata di igiene prima di proseguire lo sviluppo.

**Documentazione**
- Nuovo `docs/ARCHITECTURE.md` (in inglese): mappa per chi riprende il progetto — struttura,
  i 3 tipi di modulo frontend (componenti / stato a runes / estensioni editor), elenco dei
  moduli di stato, livello IPC (comandi Tauri per area + come aggiungerne uno), persistenza,
  theming, convenzioni, ricetta "aggiungi una feature". `NOTES.md` resta il diario decisionale.
- Screenshot dell'app aggiunto in cima al `README.md` (`docs/screenshot.png`).

**Pulizia**
- Rimosso il comando IPC inutilizzato `app_info` (smoke-test della M1).
- Rimosse 11 icone Store/MSIX non referenziate in `tauri.conf.json` (restano 32/128/128@2x/
  icns/ico/png).
- Eliminato uno screenshot-spazzatura (immagine vuota da un tentativo di cattura fallito).

**Refactor (comportamento invariato)**
- Centralizzati `normSlash` e `relTo` in `util.ts`; deduplicata la normalizzazione path in 5
  file (git, Editor, Explorer, EditorArea, shelf).
- Estratti due primitivi UI riusabili: `Backdrop.svelte` (overlay + Esc, usato dai 5 popup:
  context menu, quick-open, settings, scaffale, popup branch) e `Switch.svelte` (toggle delle
  Impostazioni).

Verifica: `svelte-check` 168 file 0/0; `cargo check` pulito. (Refactor type-clean e
comportamento preservato per costruzione; sanity-check runtime consigliato con `npm run tauri dev`.)

---

## Milestone 23 — più linguaggi + esperienza Markdown/Docs

Tre richieste: indentare i file non coperti da `language-data`, un'esperienza Markdown "più
figa del solito" e una vista dedicata alla documentazione.

**Svelte (e affini) indentati**
- I `.svelte` non erano evidenziati né indentati: Svelte **non è** in `@codemirror/language-data`,
  quindi cadeva a testo semplice. Aggiunto `@replit/codemirror-lang-svelte` con **import dinamico**
  dentro `loadLanguage()` (caso speciale per estensione `.svelte`): la grammatica pesa solo quando
  apri un file Svelte, coerente con il resto delle grammatiche lazy.

**Markdown: toggle sorgente ↔ anteprima (no split)**
- Niente finestra divisa: un **toggle** nella breadcrumb mostra *solo* sorgente o *solo* anteprima.
  Stato `preview` per-tab in `workspace` (`togglePreview`/`setPreview`); i `README.md` si aprono
  già in anteprima.
- Rendering in `src/lib/markdown.ts`: **marked + DOMPurify** caricati **on-demand** (import
  dinamico) — non pesano sull'avvio (chunk separati: marked ~43 KB, purify ~27 KB) e l'HTML è
  **sanitizzato** (un README malevolo non può eseguire script nel webview, che ha accesso all'IPC).
- `MarkdownView.svelte` — anteprima "reading-mode" (colonna centrata, tipografia curata) con extra:
  - **TOC flottante** ("Outline") generato dagli heading, comprimibile; click → scroll all'ancora.
  - **Task list interattive**: spuntare una casella riscrive la riga `- [ ]`/`- [x]` nel sorgente
    (per ordine di comparsa, saltando i fence) e salva.
  - **Link e ancore**: i link interni `.md` aprono il file, gli `#anchor` scrollano, gli esterni
    vanno al browser. `preventDefault` su *tutti* i link → l'app non naviga mai via.
  - Id slug sugli heading dopo il render (coerenti tra TOC e ancore).

**Vista Docs (albero gerarchico)**
- Nuova voce **Docs** nella top bar + pannello in sidebar (`DocsView.svelte`, stato `docs.svelte.ts`).
- Indicizza i markdown del progetto riusando il comando Rust `list_files` (README di root + tutto
  sotto `docs/`) e li presenta come **albero pieghevole** che rispecchia le cartelle — pensato per
  documentazioni grandi (centinaia di file su più livelli, es. progetti con `00-…/01-…/99-…`):
  - **ordinamento per prefisso numerico** (`00-…99-`) su cartelle e file; il numero diventa un
    badge e non sporca il titolo;
  - **titoli puliti** (kebab/snake → Title Case, con un set di acronimi: API, FSM, WS…);
  - **cartelle "meta" `_`** (es. `_archive`, `_plans`) attenuate e spinte in fondo;
  - **README/index → "Overview"** (in caso di doppio README vince quello dentro `docs/`).
- Click su una pagina → la apre **in anteprima** (con il suo TOC). Caricamento lazy: l'albero si
  costruisce solo quando la vista è montata (`$effect` su `rootPath`) e si aggiorna su `fs-changed`
  **solo se** la vista Docs è aperta (niente walk dell'albero a ogni modifica).

Verifica: `svelte-check` 175 file 0/0; `vite build` ok (marked/purify confermati come chunk
lazy separati). Non implementato (non richiesto): azione "Crea docs" di scaffold.

---

## Milestone 24 — integrazione Claude Code

Orbit nasce come *companion* di Claude Code: questa milestone porta Claude dentro il flusso.

**Menu Claude (barra in alto)**
- Nuovo menu **✨ Claude** accanto a Esegui ▶ (`claude.svelte.ts`): apre Claude in una tab del
  terminale **nella radice del progetto** e offre *scorciatoie* = prompt predefiniti lanciati come
  `claude "<prompt>"`. Claude parte sempre **interattivo**: l'utente supervisiona (cruciale per
  commit/push). Il prompt è quotato in sicurezza (una riga, niente virgolette doppie interne).
- Scorciatoie di default: **Aggiorna documentazione**, **Recupera contesto progetto**,
  **Commit & push (con revisione)** (esamina il diff, distingue cosa tenere/scartare, chiede
  conferma prima di pushare).

**Configurazione `.orbit/claude.json` (per progetto, come run.json)**
- `command` (default `claude`), `args` (flag liberi, es. `--model opus` — future-proof se i
  settings di Claude cambiano), `shortcuts[]` (`name`/`prompt`/`icon`). Committato e **modificabile
  da Claude stesso**: il formato è documentato in `CLAUDE.md` ("Document shortcuts"), così puoi
  chiedere a Claude "aggiungi una scorciatoia che lancia i test e ne sistema i fallimenti" e
  compare nel menu. Orbit lo ricarica su `fs-changed`. Se il file manca, valgono i default
  (menu sempre funzionante).

**Terminale di default = Claude**
- Nuova impostazione **`claudeTerminal`** (Settings, ON di default): quando Orbit apre il terminale
  per te (avvio, o riapertura del pannello vuoto) e c'è un progetto aperto, avvia `claude` base
  invece di una shell vuota. Il `+` resta una shell normale; spegnendo l'opzione torna tutto come prima.
- Per evitare di partire nella cartella sbagliata, il pannello attende `workspace.ready` (settato a
  fine caricamento sessione) prima di decidere Claude-vs-shell.

Riuso, non reinvenzione: avvio e scorciatoie poggiano sullo stesso meccanismo delle run config
(`addTerminal({ cwd, initCommand })`). Orbit non fa git da sé: semina solo il comando nel terminale
interattivo, sotto la tua supervisione.

Verifica: `svelte-check` 176 file 0/0.

---

## Milestone 25 — refactor + pulizia pre-release

Passata di consolidamento prima della release (Markdown/Docs + integrazione Claude).

**Refactor (comportamento invariato)**
- Estratto `dotorbit.ts`: helper condivisi per la config di progetto in `.orbit/` (path, lettura
  JSON, creazione da template, documentazione del formato in `CLAUDE.md`). `run.svelte.ts` e
  `claude.svelte.ts` vi poggiano sopra → eliminata la duplicazione `configPath`/`ensureFile`/`teach*`.
- Estratto `projectFiles.ts`: `list_files` con **cache per-root** e dedup delle chiamate concorrenti,
  condiviso da Quick Open e Docs (niente più doppio walk dell'albero); invalidata su `fs-changed`.
- TopBar: helper `menuPos` per i menu a tendina (run/claude).

**Pulizia / naming → Orbit**
- Rinominati simboli ed etichette residui da "lume" a "orbit" dove **non** impatta gli utenti:
  titolo finestra (`index.html`, ora anche `lang="en"`), tema editor (`orbitTheme`/`orbitHighlight`),
  nome pacchetto npm, crate Rust (`orbit`/`orbit_lib`, binario ora `orbit.exe`), descrizioni in
  inglese, firma git di fallback.
- **Identifier bundle `com.visialab.lume` lasciato invariato di proposito**: cambiarlo
  orfanizzerebbe sessioni (`%APPDATA%/com.visialab.lume/`) e impostazioni (localStorage per-origine)
  degli utenti, e per OS/installer sarebbe un'app nuova. (Rivede in parte la nota precedente "nome
  interno lume tenuto per non rompere build": ora il *crate/pacchetto* è `orbit`, ma l'*identifier*
  resta.) Anche le env var `LUME_*` (contratto CLI/test) restano.
- `CLAUDE.md` documenta ora anche `.orbit/claude.json`; aggiunto al repo `.orbit/claude.json`
  (dogfood: le 3 scorciatoie di default).

Verifica: `svelte-check` 178 file 0/0; `cargo check` + `cargo test` ok (8/8, binario `orbit`);
`vite build` ok.

---

## Milestone 26 — split view (riquadri editor affiancati)

Ultima feature prima della release: trascinare le schede per affiancare codice/documentazione,
stile VS Code (N riquadri in fila).

**Modello a gruppi editor**
- `workspace` passa da "tab singole + activePath" a: **pool di documenti** (`openFiles`, con
  contenuto/dirty condivisi) + **`groups[]`** (ogni gruppo = colonna affiancata con le sue `tabs` e
  il suo `activePath`) + `activeGroupId`. Lo stesso file può stare in più gruppi. Un documento si
  chiude dal pool solo quando nessun gruppo lo referenzia (`pruneDocs`); un gruppo vuoto si rimuove
  (tranne l'ultimo). Nuove azioni: `setActiveTab`/`setActiveGroup`/`closeTab`/`moveTab`/`reorderTab`/
  `splitWithTab`; `activeFile()`/`activePath()` derivano ora dal gruppo attivo.
- `savePath(path)` salva un documento specifico (ogni editor salva il proprio file); `saveActive()`
  salva il file del gruppo attivo.

**UI + drag & drop**
- `EditorArea.svelte` renderizza N gruppi affiancati (flex uguale), ciascuno con la sua barra tab,
  breadcrumb e superficie (editor / anteprima / diff). Drag&drop **HTML5 nativo** (zero librerie):
  tab sul **bordo destro** → zona "Split" → nuovo riquadro; sulla **barra di un altro riquadro** →
  sposta; nella **stessa barra** → riordina (indice dai punti medi delle tab).
- Solo l'editor del **gruppo attivo** aggiorna la status bar (cursore); il click su un gruppo lo
  rende attivo.

**Persistenza** (`persist.svelte.ts`)
- La sessione salva i gruppi (tab + attiva) e il gruppo attivo (formato **v2**); legge ancora le
  sessioni **v1** (un solo gruppo) per retrocompatibilità.

Verifica: `svelte-check` 178 file 0/0; `vite build` ok.

---

## Milestone 27 — rifiniture split view + terminale flottante

Giro di correzioni emerse provando lo split view, più il rifacimento del terminale flottante.

**Drag&drop, wrapping, layout**
- Il drag delle schede non partiva (cursore "stop"): **Tauri intercetta il drag a livello OS**
  (`dragDropEnabled`, default `true`) e disabilita l'HTML5 DnD nella pagina → messo a **`false`** in
  `tauri.conf.json` (+ `dropEffect="move"` sui target).
- **Line wrapping** nell'editor: le righe lunghe vanno a capo, con il gutter dei numeri coerente.
- L'editor non viene più nascosto dal terminale: `min-width` sull'area editor, terminale
  comprimibile (`flex:0 1 auto`), `.body { overflow:hidden }`.
- **Schede**: larghezza minima leggibile + scroll, e un menu **"tutte le schede"** per riquadro
  (chevron) che le elenca e le chiude quando sono molte.

**Terminale**
- Riga nera in fondo: il container è allineato allo sfondo del tema xterm (`#1e1e1e`).
- Resize **debounced** e inviato solo se cambia la griglia (`cols/rows`) → niente più ridisegni
  "duplicati" dei programmi TUI (es. il banner di Claude) durante lo zoom del font.

**Terminale flottante — rifatto**
- Prima apriva un terminale *nuovo*. Ora **estrae il terminale attivo**: il PTY vive nel backend
  (per `id`), la finestra flottante ci si **aggancia** (prop `attach`: nessun rispawn, solo un
  `pty_resize` → il TUI si ridisegna). Il terminale lascia il pannello senza uccidere il PTY
  (`removeTerminalKeepPty`).
- **Rientro**: pulsante **Dock** (o chiusura della finestra) → evento globale `term-redock` (con la
  label della finestra d'origine, per il multi-istanza) → `redockTerminal` ricollega in `attach`.
  La **✕** invece termina davvero il PTY.
- **Chrome coerente**: `decorations:false` + title bar custom (logo Orbit, nome, Dock/Min/Close),
  terminale in un pannello con **bordo accento** come i pannelli a fuoco.
- Capabilities aggiunte: `core:window:allow-destroy`, `core:event:allow-emit`.

Verifica: `svelte-check` 178 file 0/0; `cargo check`/`cargo test` ok (8/8); rebuild Tauri ok.

---

## Milestone 28 — revisione pre-release (v0.2.0)

Passata di revisione prima di pubblicare: tre audit indipendenti (split view, terminale flottante,
repo/doc) + misure di footprint sul build release. Correzioni applicate ai bug reali emersi.

**Split view — robustezza drag&drop** (`workspace.svelte.ts`, `EditorArea.svelte`)
- L'overlay "Split" poteva restare bloccato se la scheda trascinata spariva a metà drag (rename/
  delete esterno): aggiunto un `$effect` che annulla il drag quando il path non è più in nessun
  gruppo, più un `svelte:window ondragend` (cattura anche Esc / rilascio nel vuoto).
- `splitWithTab`: guardia `from.tabs.includes(path)` → niente più gruppo vuoto fantasma con path stale.
- `moveTab`: se la scheda è già aperta nel gruppo destinazione ora la **riposiziona** (niente
  duplicati, indice di rilascio rispettato) invece di ignorare la posizione.

**Terminale flottante — affidabilità** (`TerminalPanel.svelte`, `App.svelte`, `Terminal.svelte`)
- `detach()` ora rimuove la scheda dal pannello **solo a finestra creata** (`tauri://created`); se
  la creazione fallisce la scheda resta → niente terminale orfano.
- Handler di chiusura registrato **subito** (prima di altri await) e `unlisten` hoisted: `Dock`
  riaggancia, `✕` termina davvero il PTY, senza dipendere dalla differenza `close()`/`destroy()`.
- I link cliccabili nella finestra flottante sono disattivati via prop esplicita `enableLinks`
  (prima il check `id !== "float"` non scattava più, perché l'id è `term-N`).

**Cleanup PTY all'uscita** (`pty.rs`, `lib.rs`)
- `PtyManager::kill_all` + `Drop`, e gancio su `RunEvent::ExitRequested`: alla chiusura dell'app
  i processi figli (shell/`claude`) vengono terminati → niente più processi orfani in background
  (era un leak pre-esistente).

**Footprint misurato (release v0.2.0)** — invariato rispetto alla 0.1.0 nonostante le nuove feature:
- portable `orbit.exe` **5,25 MB**; MSI **3,79 MB**; NSIS **2,61 MB**; chunk d'avvio **174 KB** (58 KB gzip).
- RAM a riposo (progetto aperto): **~220 MB private** (orbit + WebView2); il core Rust è **~30 MB**,
  il resto è la WebView di sistema. I processi del terminale (`claude` ~350 MB Node, shell) sono a
  parte. Coerente con l'indagine M21 (225 MB senza WebGL). Corretto il README (dichiarava ~100 MB).

**Esito audit**: nessun dead code, naming `lume` residuo solo dove intenzionale (identifier, `LUME_*`),
repo pulito, doc accurate. Aggiunto questo TOC a NOTES e i due helper (`dotorbit`/`projectFiles`) ad
ARCHITECTURE.

Verifica: `svelte-check` 178 file 0/0; `cargo check`/`cargo test` ok (8/8); build release ok.

---

## Milestone 29 — git completo, vai al simbolo, chat Claude (v0.3.0)

Ciclo di nuove feature dopo la v0.2.0, chiuso da una revisione approfondita (perf, pulizia,
robustezza) e dall'hardening del backend.

**Git ibrido — fetch/pull/push/merge dal pannello** (`git.rs`, `git.svelte.ts`, `GitPanel.svelte`)
- Indicatore **ahead/behind** calcolato in locale con libgit2 (`git_upstream`): nessuna rete,
  niente openssl/libssh2 (gate #1 preservato).
- Pulsanti **Fetch / Pull / Push / Merge** che eseguono il `git` CLI in una tab del terminale →
  riusano l'autenticazione git dell'utente, output reale e supervisionabile. Push imposta
  l'upstream (`-u origin <branch>`) se manca; Merge sceglie da un menu degli altri branch locali.
- I dropdown branch e merge ora si chiudono col click-fuori/Escape (`Backdrop`), coerenti col resto.

**Vai al simbolo — Ctrl+Shift+O** (`editor/outline.ts`, `editor/activeEditor.ts`, `SymbolPalette.svelte`)
- Outline estratto dall'albero sintattico di CodeMirror (`ensureSyntaxTree`), palette fuzzy con
  salto alla definizione. Nessuna dipendenza nuova.

**Chat Claude recenti** (`lib.rs`, `claudeChats.svelte.ts`, `ClaudeChatsView.svelte`)
- Vista che elenca le sessioni Claude Code del progetto (legge i transcript JSONL in
  `~/.claude/projects/<slug>/`), titolo dal primo messaggio utente; click → `claude --resume <id>`
  (id validato come UUID: niente injection).

**Menu contestuale file** (`Explorer.svelte`, `lib.rs`)
- "Apri terminale qui", "Mostra in Explorer" (`reveal_path`), "Copia percorso relativo".

**Più linguaggi e icone** (`util.ts`, `Icon.svelte`)
- Alias di estensione verso grammatiche già installate, glifi per più tipi di file, icone per la
  sincronizzazione git.

**Hardening terminale / detach-reattach** (`pty.rs`, `terminals.svelte.ts`, `lib.rs`)
- PTY morto rimosso dalla mappa su EOF + `pty_alive` → il redock verifica che il PTY sia vivo
  (niente tab zombie). Lock dei comandi PTY **poison-safe**. **Token di spawn**: il thread lettore
  rimuove solo la propria sessione, mai una ri-attaccata sullo stesso id. `reveal_path` valida
  l'esistenza del path (niente cartella sbagliata aperta in silenzio).

**Revisione pre-release** (3 audit paralleli: Rust, stato, componenti)
- Perf: il git-gutter ri-diffa **solo il file davvero cambiato** (prima un `git_diff` per ogni
  editor a ogni evento FS); `loadUpstream` non bloccante; `stageAll` in parallelo.
- Leak chiuso: `win.onResized` (TopBar) ora ha cleanup. Race-guard in `loadClaudeChats`.

Verifica: `svelte-check` 184 file 0/0; `cargo check`/`cargo test` ok (8/8); build release ok.

---

## Milestone 30 — viewer immagini e PDF, drop file, menu contestuali, multi-detach (v0.3.1)

Giro di feature e rifiniture dopo la v0.3.0, chiuso da una **revisione approfondita** (3 audit
paralleli: Rust/config, stato, componenti). Nessun bug grave; applicati i fix utili.

**Viewer immagini e PDF** (`util.ts`, `workspace.svelte.ts`, `AssetView.svelte`, `tauri.conf.json`, `Cargo.toml`)
- `assetKind` riconosce immagini/PDF → `loadDoc` crea un doc `image`/`pdf` (niente lettura testo);
  `AssetView` li mostra via **asset protocol** (`convertFileSrc`, no base64). Richiede `assetProtocol`
  in tauri.conf + la feature Cargo `protocol-asset`. Scope `["**"]` (i progetti stanno anche su `D:\`).

**Drop file dal SO + drag tab pointer-based** (`tauri.conf.json`, `EditorArea.svelte`, `App.svelte`)
- `dragDropEnabled:true` → si trascinano file da Esplora risorse nell'editor (`onDragDropEvent`).
  Quel flag rompe l'HTML5 DnD, quindi il **drag delle tab è stato riscritto a pointer event** (+
  `elementFromPoint`), con zona di split allargata e indicatori. Un soppressore globale di
  `dragstart`/`contextmenu` toglie menu e cursore "stop" nativi di WebView2.

**Link del terminale** (`lib.rs`, `Terminal.svelte`)
- Comando `resolve_existing`: un path cliccato si risolve come assoluto → relativo alla cwd del
  terminale → radice, aprendo il primo che esiste (i path relativi di Claude: niente più os error 2).

**Menu contestuali** (`Editor.svelte`, `Explorer.svelte`, `ContextMenu.svelte`)
- Editor: Taglia/Copia/Incolla/Seleziona tutto/Vai al simbolo. Albero: "Apri di lato", "Copia nome".
  Le voci lunghe del menu vanno a capo su 2 righe.

**Scratchpad** (`scratch.ts`, `TopBar.svelte`)
- Pulsante 📝 → apre `.orbit/scratch.md`, file persistente per prompt/note (git-ignored).

**Terminale flottante multiplo + bootstrap** (`TerminalPanel.svelte`, `App.svelte`, `capabilities/default.json`)
- Etichette uniche `term-float-<id>` → più finestre flottanti, niente "una volta sola" (capability
  `windows: ["main", "term-float-*"]`). Claude di default **solo all'avvio**: l'icona terminale apre
  sempre una shell.

**Robustezza** (`workspace.svelte.ts`, `persist.svelte.ts`, `EditorArea.svelte`)
- Cambio cartella pulito (`switchFolder`: niente tab della cartella precedente). Dialog "modifiche
  non salvate" a 3 pulsanti (Salva/Non salvare/Annulla). `openRoot` cambia radice solo a lettura
  riuscita; `renameOpenPaths` rimappa anche immagini/PDF.

Verifica: `svelte-check` 186 file 0/0; `cargo check`/`cargo test` ok (8/8); build release ok.

---

## Milestone 31 — titolo finestra, wrapper Claude, Open with, menu a sezioni (v0.3.2)

Rilascio **v0.3.2** — novità rispetto alla v0.3.1:

**Titolo finestra per progetto** (`App.svelte`, `capabilities/default.json`)
- Un `$effect` imposta il titolo a `<progetto> — Orbit` (`setTitle`, permesso
  `core:window:allow-set-title`): con più istanze, le anteprime nella taskbar e in Alt-Tab diventano
  distinguibili invece di essere tutte "Orbit".

**Wrapper Claude** (`claude.svelte.ts`, `WrapperComposer.svelte`, `TopBar.svelte`)
- Template di prompt con segnaposto `{{input}}` in `.orbit/claude.json`. Dal menu Claude si apre il
  composer: scrivi il prompt, vedi l'anteprima del testo composto e lo **copi negli appunti** (niente
  shell → multiriga ok). Il menu Claude è diviso in sezioni **Prompts / Wrappers / Configuration**
  (header non cliccabili in `ContextMenu`). Wrapper di default: *Analizza log di test* (analizza una
  cartella di log della sessione di test, decomprimendo eventuali zip annidati).

**Doc per Claude completa e rigenerabile** (`claude.svelte.ts`, `dotorbit.ts`, `CLAUDE.md`)
- La sezione `orbit:claude-config` di CLAUDE.md ora descrive tutte le funzioni di Orbit (non solo le
  scorciatoie) + il formato `.orbit/claude.json` (scorciatoie e wrapper). `teachClaudeSection`
  **aggiorna** la sezione (start+end marker) invece di crearla soltanto.

**Open with (Windows)** (`tauri.conf.json`, `lib.rs`)
- `bundle.fileAssociations` registra Orbit come handler per i tipi comuni → compare nel menu "Apri
  con" (registrato dall'**installer**, non da `tauri dev`). `startup()` apre anche un file passato
  come argomento CLI (`orbit.exe "<file>"`) usando la sua cartella come workspace.

**Chat Claude più riconoscibili** (`lib.rs`, `claudeChats.svelte.ts`, `ClaudeChatsView.svelte`)
- L'anteprima di ogni sessione non è più il *primo* prompt (spesso identico tra chat) ma l'**ultimo
  messaggio utente "vero"** + il **numero di turni** (`session_preview` salta i blocchi vuoti, di
  sistema e di ripresa della conversazione). La vista resta compatta: anteprima fino a 2 righe e,
  sotto, `tempo · N msg`.

**Git** (`git.svelte.ts`)
- Feedback al click sui pulsanti di rete (toast "git … → terminale") per confermare l'azione.

Verifica: `svelte-check` 187 file 0/0; `cargo test` 8/8; `npm run tauri build` OK (MSI + NSIS + portable). Footprint reale aggiornato nel README (binario 5,3 MB, chunk d'avvio ~497 KB / ≈165 KB gz). Rilascio: v0.3.2 su GitHub.

---

## Milestone 32 — temi, glifi file per-linguaggio, notifica Claude, trim d'avvio (v0.4.0)

Ciclo di feature dopo la v0.3.2 (companion Claude + look). Quattro interventi; **zero dipendenze
runtime nuove** (solo SVG inline e i pacchetti già presenti).

**Notifica "Claude ti aspetta"** (`terminals.svelte.ts`, `Terminal.svelte`, `TerminalPanel.svelte`, `settings`)
- L'xterm espone `onBell`: Claude suona la *bell* a fine turno / quando attende input. Se il terminale
  che ha suonato **non** è quello che stai guardando (scheda attiva + pannello visibile + finestra a
  fuoco), Orbit segnala: **pallino accento pulsante** sulla scheda + **toast** (solo a finestra a
  fuoco, altrimenti non lo vedresti). Si spegne aprendo la scheda o al ritorno a fuoco. Gating +
  anti-spam: niente notifiche mentre ci stai già scrivendo (i BEL spurî di bash sono ignorati).
  Toggle `bellNotify` in Impostazioni (ON di default). Limite: vale a pannello aperto (a pannello
  chiuso l'xterm è smontato); coprire anche quel caso richiederebbe rilevare il BEL nel backend (PTY)
  — rimandato.

**Trim del chunk d'avvio** (`Lazy.svelte`, `App.svelte`, `EditorArea.svelte`, `Sidebar.svelte`)
- Nuovo helper generico `Lazy.svelte` (`load={() => import("./X.svelte")}` + prop inoltrati, import una
  volta sola): resi **lazy** gli overlay (Settings, WrapperComposer, QuickOpen, SymbolPalette), i
  viewer (DiffView, AssetView, MarkdownView) e le viste sidebar non-default (Git, Search, Docs, Chat)
  — l'Explorer resta eager. Entry **497 → 469 KB** (gz 165 → 156) + ~14 KB di CSS d'avvio in meno
  (CSS per-componente splittato). Payoff pratico modesto (app locale), ma nello spirito del gate #1 e
  soprattutto l'architettura giusta (non caricare ciò che non si mostra).

**Temi completi (4 preset)** (`app.css`, `settings.svelte.ts`, `editor/theme.ts`, `Editor.svelte`, `Settings.svelte`)
- Esteso il meccanismo degli ACCENTS a **temi interi**: ogni tema sovrascrive tutte le superfici/
  linee/inchiostri + bg + accento di default + le variabili editor `--cm-*` (selezione/riga attiva/
  bracket) come CSS vars su `documentElement`, persistite in localStorage. Preset: **Orbit Dark**
  (default, firma), **Eclipse** (OLED), **Slate** (neutro), **Orbit Light** (chiaro). surface-3/4
  derivati verso l'inchiostro per coerenza su scuro e chiaro; i token base di `app.css` ora valgono
  Orbit Dark (niente flash pre-JS).
- **Accento "Auto"** (nuovo default): segue l'accento del tema (così Eclipse è teal, ecc.); i 4 preset
  (blu/viola/verde/teal) restano come override esplicito applicato dopo il tema.
- **Tema chiaro**: nuova `HighlightStyle` chiara (palette VS Light+) in `editor/theme.ts`, scelta in
  base al tema attivo via un Compartment in `Editor.svelte` (riconfigurato al cambio); selezione/riga
  attiva/bracket dell'editor passano da hex fissi a `var(--cm-*)` → si adattano da soli. Selettore
  Tema in Impostazioni con anteprima viva per preset; cambio **LIVE**.

**Glifi file per-linguaggio (approccio ibrido)** (`util.ts`, `FileGlyph.svelte`, `Icon.svelte`, call-site)
- Prima quasi tutti i linguaggi usavano lo stesso glifo `braces` cambiando solo colore. Nuovo
  `FileGlyph.svelte`: (a) **simbolo SVG dedicato** per i linguaggi con identità (Rust esagono, Svelte
  swoosh, Python dischi, Go/Vue chevron/doppia-V); (b) **tile monogramma** ≤2 caratteri per TS, JS,
  JSON, C, C++, C#, Java, Ruby, PHP — fondo e testo ricavati dal colore-linguaggio con una ricetta a
  **un solo punto di switch** (tenue ↔ pieno); (c) fallback line-art (`Icon`) per i tipi non-codice.
  `fileIcon()` ora ritorna id `lang:*` / `tile:*`; Dockerfile passa da `database` a un glifo **box**
  (container), CSS/SCSS/Less da `#` a **paintbrush**. Call-site aggiornati: albero, MiniTree, tab
  editor, breadcrumb, Quick Open, Cerca.

**Icona app + wordmark del brand (Jost Light)** (`src-tauri/icons/`, `app-icon.png`, `src/lib/assets/orbit-wordmark.svg`, `EditorArea.svelte`, `README.md`)
- Nuova icona (pianeta con anello su gradiente viola→blu): set rigenerato con `tauri icon` da
  `app-icon.png` (1024², sorgente versionata nel repo). Tolte di nuovo le icone Windows Store/MSIX
  generate ma non usate da `bundle.icon` (coerente con M22). Wordmark "Orbit" in **Jost Light**
  convertito in **tracciati vettoriali** (niente font a runtime) col gradiente del brand: usato
  nell'hero del README (icona + wordmark grande + badge, stile OSS curato) e nella schermata di
  benvenuto (sostituisce il testo Inter; bonus: ora visibile anche su Orbit Light, dove il vecchio
  gradiente chiaro spariva).

Verifica: `svelte-check` 189 file 0/0; `cargo test` 8/8; `vite build` ok (entry 474 KB / 158 KB gz).
Nessuna dipendenza runtime nuova. README/ARCHITECTURE riallineati. Rilascio: **v0.4.0** su GitHub
(NSIS + MSI + portable, build size-optimized).

---

## Milestone 33 — la finestra ricorda posizione e dimensione

Fix companion-quotidiano: Orbit ripartiva sempre **centrato a 1280×800**, ignorando dove l'avevi
lasciato. Ora posizione, dimensione e stato massimizzato si salvano all'uscita e si ripristinano
all'avvio. **Zero dipendenze nuove** (solo `std` + `serde` + le API finestra di Tauri), coerente
col gate #1 — scelta esplicita di non usare `tauri-plugin-window-state`.

**Persistenza geometria** (`src-tauri/src/winstate.rs` nuovo, `lib.rs`, `tauri.conf.json`)
- **Salvataggio** in `window.json` accanto alle sessioni (`app_config_dir`, come `save_state`):
  x/y/larghezza/altezza + flag massimizzato. Scritto su `CloseRequested` (la finestra esiste
  ancora) e, come rete di sicurezza, su `ExitRequested`.
- **Ripristino** in `.setup()`: applica dimensione/posizione alla finestra `main`, poi `maximize()`
  se serve. La config ora crea la finestra `visible: false` e `winstate` la **mostra** dopo averla
  posizionata → sparisce il "salto" dalla posizione centrata di default a quella salvata.
- **Geometria "normale" tracciata** sui `Moved`/`Resized` (scartando max/min e le coordinate
  sentinella −32000 di Windows da minimizzata): è ciò che si salva, così ripristinando e poi
  de-massimizzando la finestra torna a una dimensione sensata.
- **Guardia anti off-screen**: se la barra del titolo cadrebbe su un monitor ora scollegato,
  ripristina la dimensione ma non la posizione (con le decorazioni native off, una finestra fuori
  da ogni schermo sarebbe irraggiungibile). Si applica **solo** alla finestra `main`: le flottanti
  del terminale (`term-float-*`, create a runtime) restano effimere.

Verifica: `cargo check` pulito; `cargo test` 14/14. Nessuna modifica frontend (`svelte-check` non
coinvolto); nessun cambio alle capabilities (le chiamate alla finestra sono lato Rust).

---

## Milestone 34 — navigazione del codice, scorciatoie configurabili, esegui script

Ciclo dopo la v0.4.0, **non ancora rilasciato** (in attesa di altre feature in lavorazione in
parallelo). **Zero dipendenze runtime nuove** e nessun comando Rust nuovo salvo `scan_symbols`.

**Logo in-app = nuova icona** (`Logo.svelte`)
- Il mark mostrato nell'UI (barra superiore + finestra flottante del terminale) era rimasto il
  vecchio glifo: ora è la **nuova icona dell'app** (pianeta con anello), coerente con l'icona OS e
  con l'hero del README.

**Esegui un file script con un click** (`util.ts`, `run.svelte.ts`, `Explorer.svelte`, `EditorArea.svelte`)
- Complemento delle run-config (M13): i file **eseguibili** (`.ps1`, `.cmd`/`.bat`, `.sh`/`.bash`)
  hanno un'azione **Run ▶** nel menu contestuale dell'albero e un pulsante nella barra dell'editor.
  `runFile` apre una **tab terminale** nella cartella del file e invia il comando con l'interprete
  giusto (`runCommand` in `util.ts`: mappa estensione→interprete); `isRunnable` decide chi è
  lanciabile. Zero comandi Rust nuovi (riusa il modello terminali con `cwd`/`initCommand`).

**Navigazione del codice — euristica, niente LSP** (`symbols.rs`, `codeIndex.svelte.ts`, `RelatedBar.svelte`, `KindBadge.svelte`, `WorkspaceSymbols.svelte`, `StatusBar.svelte`)
Obiettivo: orientarsi nella codebase (da un metodo/classe alla sua definizione, vedere le gerarchie)
**senza** un language server — coerente coi gate (leggerezza, niente processi pesanti).
- **Scanner Rust `scan_symbols`** (`symbols.rs`, **solo std**, niente crate `regex`, niente LSP):
  percorre il progetto ed estrae i simboli con parser a mano per linguaggio — **C#/Java**,
  **TS/JS/JSX/TSX/Svelte/mjs/cjs**, **Python**, **Rust**, **Go**. `Symbol { name, kind, file, line,
  container, bases, isAbstract }`: tipi (class/interface/struct/enum/record/trait), metodi, funzioni,
  proprietà, più le **basi** (extends/implements) e il flag **astratto**. Coperto da `cargo test`
  (estrazione per linguaggio + flag abstract).
- **Rubrica cache-ata** (`codeIndex.svelte.ts`): l'indice è salvato in **`.orbit/index/symbols.json`**
  (git-ignored) → si carica **all'istante** all'apertura e poi si **ri-scansiona in background**;
  `scheduleRescan` (debounced 800ms) si aggancia a `fs-changed`. Il watcher **esclude `.orbit/index`**
  per non innescare un loop di scansione. Indicatore di stato nella status bar ("N symbols" / "Indexing…").
- **Vai alla definizione** (`F12` / **Ctrl+click** nell'editor): la parola sotto il cursore →
  `defsFor` → salto; con più definizioni omonime apre una palette in modalità "scegli definizione".
  Il salto registra la posizione per la **cronologia** (`Alt+←/→`, stack avanti/indietro).
- **Simboli del progetto** (`Ctrl+T`, `WorkspaceSymbols.svelte`): palette fuzzy su tutti i simboli.
- **Barra dei correlati** sotto la breadcrumb (`RelatedBar.svelte`): mostra il simbolo che **contiene
  il cursore** (Tipo › Metodo, nearest-preceding nel file) con **chip** per implementa/estende
  (cliccabili → definizione) e per gli **implementatori** del tipo; `contextAt` calcola il contesto.
  **Badge di tipo monogramma** (`KindBadge.svelte`: C/I/S/E/R/T/M/ƒ/P, tipi astratti col bordo
  tratteggiato) per leggere la gerarchia a colpo d'occhio. La barra **riserva l'altezza** quando il
  file ha simboli (niente salto di layout) e si **svuota** quando il cursore è fuori da un simbolo
  (scelta utente: meglio vuota che mostrare il simbolo "vecchio").

**Scorciatoie configurabili + riepilogo** (`keybindings.svelte.ts`, `settings.svelte.ts`, `App.svelte`, `Settings.svelte`, `ShortcutsDialog.svelte`)
- **Registro centrale dei comandi** (`COMMANDS`) con un tasto **per preset**; il dispatch da tastiera
  è **unico** in `App.svelte` (`matchCommand(e)` → azione), così i preset valgono ovunque (F12 spostato
  dalla keymap di CodeMirror al livello finestra). `FIXED` elenca le scorciatoie editor/mouse non
  configurabili per il solo riepilogo.
- **Preset**: **Orbit** (default), **Visual Studio**, **IntelliJ** (`settings.keymap`, persistito).
- **Pannello "Keyboard shortcuts"** (`ShortcutsDialog.svelte`): aperto da Impostazioni con **un click**
  (così non sporca i Settings); selettore del preset + elenco completo raggruppato per categoria.

Verifica: `svelte-check` 195 file 0/0; `cargo test` **14/14** (filesystem + estrazione simboli per
linguaggio + flag abstract). Zero dipendenze runtime nuove. README/ARCHITECTURE riallineati.
Confluisce nella **release v0.5.0** insieme a M33 e M35 (vedi M35 per il bump di versione e i gate pre-release).

---

## Milestone 35 — segui il file attivo, badge + pin del terminale flottante (v0.5.0)

Le "feature secondarie in sviluppo in parallelo" attese da M34: chiudono il ciclo e diventano la
**release v0.5.0**, che pubblica anche M33 (la finestra ricorda posizione/dimensione) e M34
(navigazione del codice, scorciatoie configurabili, esegui-script), finora non rilasciati.
**Zero dipendenze nuove**; un solo permesso capability nuovo (always-on-top della finestra).

**Segui il file attivo (reveal)** (`settings.svelte.ts`, `explorer.svelte.ts`, `App.svelte`, `Explorer.svelte`, `Sidebar.svelte`, `Icon.svelte`)
- Toggle **⌖** nella barra dell'explorer (persistito in `settings.revealActive`): quando è attivo,
  aprendo o cambiando file l'albero **espande gli antenati** fino al file attivo e ne porta la riga
  **in vista** (come il *reveal* di VS Code). Vale anche per Quick Open, ricerca e vai-alla-definizione.
- `revealInTree` (in `explorer`) cammina il path **per nome di segmento** (case-insensitive →
  robusto ai separatori e al case di Windows), caricando i figli lazy mancanti; un **segnale
  transitorio** `reveal {target, seq}` chiede a `Explorer.svelte` lo scroll nella lista virtuale, e
  solo se la riga è fuori dal viewport. Guardia di **rientro/coalescing** (l'ultima richiesta vince).
- **Trappola Svelte 5 evitata**: l'`$effect` in `App.svelte` che segue il file attivo invoca
  `revealInTree` dentro **`untrack`**, perché la funzione muove `tree`/`reveal` (incluso
  `reveal.seq++`, un read-modify-write). Senza `untrack` quelle letture/scritture diventano
  dipendenze dell'effetto → **auto-invalidazione → loop infinito** (bug introdotto, colto e corretto).

**Terminale flottante: badge cartella+branch e pin always-on-top** (`App.svelte`, `TerminalPanel.svelte`, `Icon.svelte`, `capabilities/default.json`)
- La barra della finestra flottante mostra ora un **badge cartella + branch** (stesso look della top
  bar). Il webview flottante non gira git per conto suo: i valori sono uno **snapshot** passato come
  **URL param** (`root`/`branch`) al momento dello stacco (in `detach`).
- **Pin 📌** per accendere/spegnere il *sempre in primo piano* a runtime
  (`getCurrentWindow().setAlwaysOnTop`). La finestra nasce ancora con `alwaysOnTop: true` e il pin
  parte attivo. Richiede il permesso **`core:window:allow-set-always-on-top`** in
  `capabilities/default.json` (le capabilities sono compile-time → serve un rebuild Rust).

**Preview Markdown allineata a sinistra** (`MarkdownView.svelte`)
- Il corpo della reading-mode passa da **centrato** (`margin: 0 auto`) ad **allineato a sinistra** +
  `display: flow-root` (BFC): l'**outline** flottante a destra ha così il suo spazio e il corpo gli si
  affianca invece di scorrergli sotto (prima h1/tabelle/righe a tutta larghezza ci finivano sotto).

Verifica: `svelte-check` 195 file 0/0; `cargo test` 14/14; **build release** size-optimized ok —
entry 493 KB (165 gz), portable 5,4 MB, MSI 3,9 MB, NSIS 2,7 MB. Zero dipendenze runtime nuove.
Bump versione → **v0.5.0** (`package.json`, `package-lock.json` ×2, `Cargo.toml`, `Cargo.lock`,
`tauri.conf.json`). Rilascio **v0.5.0** su GitHub (NSIS + MSI + portable).

---

## Milestone 36 — finestre multiple: chiudi tutte e riapri tutte (C+)

Le istanze multiple ("Nuova finestra") restano **processi separati**; mancavano due cose: **chiuderle
tutte** con un'azione e **riaprirle tutte alle loro posizioni** al riavvio. Aggiunte con un **registro
condiviso** (approccio "C+"), senza passare a single-process. Branch dedicato, sviluppo a fasi (F0–F3).

**Perché NON single-process (misura prima di decidere).** Ipotesi iniziale: un solo processo con N
finestre risparmierebbe molta RAM. Misura reale (private working set): **1 fin 249 MB · 2 fin 351 MB ·
3 fin 427 MB** (~+90 MB/finestra). Scoperta: le istanze separate **condividono già** lo stack WebView2
(stessa user-data-folder, stesso bundle id → gpu/browser/utility NON duplicati); il +90 MB è quasi tutto
renderer+GPU, **identico anche in single-process**. Quindi single-process avrebbe risparmiato solo
~5–15 MB/finestra → non vale costo/rischio del refactor. Script ripetibile: `scripts/measure-orbit-ram.ps1`.

**Registro: un file per finestra** (`src-tauri/src/winsession.rs`, che SOSTITUISCE `winstate.rs`). In
`app_config_dir`:
- `windows/<id>.json` — set VIVO, **un file per finestra** (id = `pid-nanos`). Ogni processo scrive/
  cancella SOLO il proprio file → niente race. Scrittura atomica con file-temp **unico per processo**.
  (Un primo tentativo con un unico `windows-open.json` condiviso si corrompeva: read-modify-write e
  file-temp condivisi tra processi → file rotto + update persi. Il test a runtime l'ha stanato.)
- `windows-restore.json` — snapshot da riaprire. `windows-control.json` — token per il "chiudi tutte".

**Riapri-tutte** (nessun IPC). Regola: **avvio nudo** (senza cartella da CLI/env) → ripristina il set
(questa istanza apre la prima voce e **ri-spawna** le altre passando la geometria via env `ORBIT_WIN_*`);
**avvio con cartella** (Nuova finestra, `orbit <path>`, Apri-con) → apre solo quella. La geometria è
catturata sul **blur** (`Focused(false)`) e prima dello snapshot, non solo alla chiusura (altrimenti si
ripristinerebbe la posizione d'apertura). La decisione d'avvio è in `plan()` (puro, testato).

**Chiudi-tutte.** Comando `close_all_windows`: snapshot del set → ripristino, poi uscita; segnala alle
altre istanze via **token** nel file di controllo. Ogni istanza ha un **watcher `notify`** sulla cartella
di config (event-driven, niente polling): visto un token oltre il baseline d'avvio, esce. Pulsante in TopBar.

**Recupero post-crash.** Un crash lascia un `windows/<id>.json` orfano che, risultando il set "vivo" non
vuoto, bloccherebbe il ripristino. All'avvio `prune_dead()` scarta le voci il cui **pid non è più attivo**
(`pid_alive`: cfg-gated — Windows `OpenProcess`, Unix `kill(pid,0)`).

**Dipendenze:** `windows-sys` (cfg windows) + `libc` (cfg unix) solo per la liveness — versioni **già
presenti** nell'albero come transitive → costo di compilazione nullo. Nient'altro; nessun single-process.

Verifica: `cargo test` **22/22** (logica `plan`, `pid_of`, liveness); `svelte-check` 195/0/0. **Verificato
a runtime**: 2 finestre spostate → chiudi-tutte → riavvio nudo → riaperte alle posizioni; stato "da
crash" fabbricato → potatura + ripristino. Nessuna regressione RAM/CPU (core invariato; +1 thread watcher
event-driven). Rilasciato in **v0.5.1** (insieme al pulsante Collapse all; numero patch per scelta
dell'utente anche se è una feature — semver "impuro" accettato consapevolmente).

---

## Milestone 37 — selettore repo in top bar: più cartelle aperte, una attiva (v0.6.0)

Tenere aperte **più cartelle/repo** e cambiare la **attiva** da un selettore in top bar, con tutto
il resto dell'IDE (albero, git, branch, ricerca, terminali, Esegui, Claude, scaffale) che riflette la
repo scelta. Branch dedicato, frontend-only.

**Perché QUESTO e non il multi-root simultaneo.** Il multi-root *vero* (N radici insieme in una
finestra) era stato valutato e **rimandato**: `rootPath` è single-string usato ~98× in 24 file →
refactor invasivo e rischioso. Qui invece teniamo il modello **single-active-root** identico e
aggiungiamo solo un **elenco** di cartelle + uno switch: una sola repo attiva alla volta. Dà il ~90%
del valore (avere i progetti a portata di clic) con ~1% del costo. **Zero Rust, zero dipendenze,
zero refactor** del modello esistente.

**Riuso di `switchFolder`.** Lo swap completo già esisteva (M14, istanze multiple): salva la sessione
corrente, `rootPath=null` (sospende l'autosave), `resetDocs`, `loadSession(nuova)` → `openRoot` →
albero/watcher/git/branch/run/claude/scaffale. Il selettore non fa che chiamarlo. La lista vive in
`folders.svelte.ts`, **persistita in localStorage** (`orbit.folders`, app-global → condivisa tra
finestre); ogni cartella aperta vi entra da sola (effetto su `rootPath` → `addFolder`).

**UI: tab inline, non un dropdown.** Primo tentativo con menu a tendina; feedback utente: "un click in
più ogni volta". Rifatto con **tab inline** nello spacer della top bar (1 click per cambiare): tab
attiva evidenziata col branch, "+" per aggiungere, scroll orizzontale con **autoscroll sulla tab
attiva**, e un "**…**" che apre TUTTE le repo quando le tab non entrano (overflow rilevato via
`ResizeObserver`+`MutationObserver`).

**Context-aware: reazioni al cambio root CENTRALIZZATE in `openRoot`.** Prima alcune viste restavano
"del repo precedente" (ricerca, Docs, chat Claude, cache file di Quick Open). Ora `openRoot` — il punto
UNICO d'apertura cartella — resetta ricerca, invalida la cache file e ricarica Docs/chat se sono la
vista attiva. Al **cambio** repo si forza la vista **Explorer** + sidebar visibile (deterministico:
niente Docs/Chat "a sorpresa" ereditati dalla vista salvata di quel repo; lo *startup* invece rispetta
la vista salvata).

**Terminali per-repo.** Ogni `TermSession` è taggato con `root`; `TerminalPanel` filtra la **barra tab**
per la repo attiva, ma **tutti** i terminali restano montati (PTY e scrollback vivi). Una mappa
`activeByRoot` ricorda il terminale attivo per ciascuna repo e lo ripristina allo switch.

**Scorciatoie.** `Ctrl+Tab` / `Ctrl+Shift+Tab` ciclano le repo; `Ctrl+1…9` salta alla n-esima
(registro `keybindings.svelte.ts` + dispatch in `App.svelte`).

**Robustezza.**
- *Finestra stretta* (la minWidth reale è **720 logici**): le parti fisse (nav con label, azioni) non
  si comprimevano e spingevano i **controlli finestra fuori schermo a destra**. Ora `actions`/`wctrls`
  sono `flex-shrink:0` (mai tagliati), la compressione la assorbe solo la repobar (scroll), e **sotto
  980px logici il nav diventa solo-icone** (recupera ~185px di label) → a 720 ci sta tutto, *close*
  incluso. "+"/"…" stanno **fuori** dalla striscia che scorre → sempre raggiungibili.
- *Cartella sparita*: cliccare una repo spostata/eliminata lasciava la finestra **vuota**. `switchFolder`
  ora ritorna `SwitchResult` (`switched`|`cancelled`|`failed`): su `failed` **ripristina la cartella
  precedente** (niente finestra vuota) + toast; il chiamante toglie la voce morta dal selettore.
  `openRoot` legge `read_dir` PRIMA di toccare `rootPath` → nessuno stato a metà.

**Dipendenze:** **nessuna**. Solo `switchFolder` (esistente) + localStorage + CSS responsive.

Verifica: `svelte-check` **196/0/0**; top bar verificata via **PrintWindow** a 720/960/1280 px **logici**
(DPI 125% → larghezze fisiche scalate), controlli finestra sempre visibili e nav che passa a solo-icone
sotto soglia; switch tra repo e terminali per-repo provati a runtime su cartelle di test. La gestione
"cartella sparita" è verificata con `svelte-check` ma non a runtime (richiederebbe automazione UI sulla
tab morta). **Da rilasciare in v0.6.0** (feature → minor bump) dopo revisione utente.

---

## Milestone 38 — autosave, quick-prompt, keymap custom, default markdown, nav indietro/avanti, highlight semantico C#/C++ (v0.7.0)

Lotto di rifiniture richieste dall'utente. **Quasi tutto frontend** (HMR), con **una sola aggiunta Rust**
(scanner C++). Zero dipendenze nuove.

**Reload live di `.orbit/*.json` — c'era già; aggiunto il feedback sul JSON rotto.** Il reload dei menu
Esegui/Claude su `fs-changed` esisteva dal M (v0.2.0); mancava il caso "JSON non valido": prima
`readOrbitJson` falliva in silenzio e `claude.json` invalido **resettava il menu ai default** senza
avviso. Nuovo `readOrbitConfig` (in `dotorbit.ts`) distingue **assente** da **presente-ma-invalido**:
su invalido i loader (`run`/`claude`) mostrano un **toast** e **tengono il menu corrente** (niente reset
a sorpresa). Toast deduplicato (un flag per loader) per non ripeterlo a ogni evento FS.

**Quick add / remove di prompt e wrapper** (`ClaudePrompts.svelte`, scelta utente: *quick-add leggero +
quick-delete*, non un gestore completo). Mini-pannello dal menu Claude (*Add / remove prompts…*): toggle
Prompt/Wrapper, nome + testo (+ icona opzionale), **Add**, e cestino su ogni voce. Scrive
`.orbit/claude.json` (lo crea se manca: materializza i default) via `addShortcut`/`removeShortcut`/
`addWrapper`/`removeWrapper` + `saveClaudeConfig`. Il menu si aggiorna (stato reattivo + watcher).

**Autosave stile IntelliJ** (`settings.autosave`, **ON di default**; scelta utente: *focus perso + cambio
tab*). Salva i documenti modificati su **blur della finestra** (`getCurrentWindow().onFocusChanged` in
`App.svelte` — Alt-Tab, click sul terminale flottante, altra app) e al **cambio tab/file** (`$effect` che
traccia `activePath()` e salva quello che si lascia, in `untrack`). `savePath(path, {auto:true})` è
silenzioso e **salta i file in conflitto** (modificati anche su disco) → l'autosave non calpesta mai un
edit esterno; il Ctrl+S manuale resta com'era. Ottimo da companion: passando al terminale dove gira
Claude, lui vede già l'ultima versione.

**Preset scorciatoie "Custom"** (scelta utente: *preset Custom da una base, originali intatti*).
`settings.keymap` ora include `"custom"` + `settings.customKeys` (mappa CommandId→tasto, persistita).
`KeymapBase` (orbit/vs/intellij) resta il tipo delle chiavi nei COMMANDS; il resolver `activeKey` usa
`customKeys` quando il preset è custom. In *Settings → Keyboard shortcuts*: **Customize…** duplica il
preset attivo (`createCustom`), poi ogni comando è **click-to-rebind** ("Press keys…", Esc annulla);
**Delete** rimuove il custom; i conflitti sono evidenziati (`conflictKeys`). La cattura tasti gira in
**capture-phase** su window (precede il dispatch globale → rebindare es. `Ctrl+P` non apre il quick-open)
e `keyStringFromEvent` rifiuta i tasti "nudi" non-funzione (niente lettere senza modificatori).

**Default di apertura Markdown** (`settings.mdMode`: `readme`/`preview`/`source`, default `readme` =
comportamento storico). `workspace.loadDoc` calcola `preview` iniziale da qui (solo per i `.md`). Select
nei Settings.

**Frecce indietro/avanti in top bar + cronologia "stile browser"** (scelta utente: *anche cambi
file/tab*). Le scorciatoie `Alt+←/→` esistevano (`navBack`/`navForward`); aggiunti i **pulsanti** ◀▶ in
top bar (icone nuove `arrow-left`/`arrow-right`, abilitati da conteggi reattivi `nav`, tooltip con la
scorciatoia attiva). La cronologia ora registra **anche i cambi file/tab**, non solo i salti go-to-def:
`workspace` chiama un hook **sincrono** `beforeNavigate(dest)` PRIMA di cambiare file attivo (in
`openFile`/`openInNewGroup`/`setActiveTab`); `codeIndex` lo usa per registrare la posizione lasciata.
Niente effect reattivi (soffrivano di **race async**): `navBack`/`navForward` sopprimono la registrazione
del proprio salto (flag `navigating`). Dedup per-file (stesso file / solo cursore → niente voce). Nessun
ciclo di import (workspace espone l'hook, codeIndex lo registra).

**Icona "Apri cartella" doppia** — rimossa dalla **top bar** (scelta utente), tenuta nell'header Explorer;
`Ctrl+K` e il "+" della repo bar restano. (`openFolderDialog` → `switchFolder`, tre accessi erano
ridondanti.)

**Highlight semantico C#/C++** (scelta utente: *overlay dall'indice simboli*). Diagnosi: l'highlight di
CodeMirror è solo **lessicale**; C# usa il parser **legacy `clike`** (StreamLanguage) → tipi/metodi tuoi
non colorati, "molto diverso da VS"; C++ usa la grammatica Lezer `lang-cpp` (meglio, ma comunque senza
semantica). VS usa Roslyn/IntelliSense (semantico) → senza LSP non si eguaglia. Soluzione **senza LSP**:
`editor/semanticHighlight.ts`, un `ViewPlugin` che colora gli identificatori che combaciano con un **tipo
noto** (teal, `cm-sem-type`) o **metodo/funzione noto** (oro, `cm-sem-func`) **dell'indice del progetto**
(`codeIndex.semSets`). Decora solo il range visibile, **salta stringhe/commenti** (via `syntaxTree`) e i
file senza linguaggio; si ridisegna al bump di `semIndex.version` (nudge `view.dispatch({})` da
`Editor.svelte`). Colori `!important` in `editorTheme` per prevalere sul colore lessicale. **Euristico**
(per nome, non scope-aware): colora solo i simboli **dichiarati nel progetto** (non i tipi di
framework/BCL), e una variabile locale omonima di un tipo verrebbe colorata — è il prezzo del "senza LSP".
**Scanner C++ aggiunto** (`symbols.rs`, `Lang::Cpp`, est. cpp/cxx/cc/hpp/hh/h++/c/h): tipi da
`class`/`struct`/`union`/`enum` (anche `enum class`), funzioni/metodi **solo** da righe che aprono un corpo
(`{` finale o `:` init-list di costruttore), con identificatore valido prima della `(` e un "ritorno"
davanti → conservativo, evita di catturare chiamate (terminano con `;`) e i costrutti di controllo. C# era
già coperto. +2 unit test C++.

Verifica: `svelte-check` **198/0/0**; `cargo test` **24/24** (i 2 test C++ nuovi, incl. il no-falsi-positivi
su chiamate/controlli). **Build release** size-optimized ok (1m32s): **orbit.exe 5,46 MB**, **MSI
3,96 MB**, **NSIS 2,74 MB**, entry **492 KB (≈168 gz)**, `dist/` 2,71 MB. Bump → **v0.7.0** (minor: lotto
di feature). Doc allineati (questo NOTES + README + ARCHITECTURE).

**Revisione/test utente — bug release-breaking trovato e corretto.** L'overlay semantico introduceva un
**loop reattivo**: `rebuildSemSets()` LEGGE `codeIndex.symbols` ed era chiamato (via `initIndex`) DENTRO
l'`$effect` di App che lo SCRIVE (`codeIndex.symbols = []`, ramo "nessuna cartella") → Svelte rileva
read+write dello stesso stato → `effect_update_depth_exceeded` → **spegne TUTTA la reattività della UI**.
Sintomo: `openRoot` impostava `rootPath` nell'oggetto, ma nessun effetto/template si aggiornava → l'app
restava su "No folder open" e l'apertura cartella "non funzionava" (apriva, ma la UI non reagiva).
**Fix:** `untrack` attorno a `void initIndex()` (l'effetto dipende SOLO da `rootPath`) e attorno alla
lettura di `codeIndex.symbols` in `rebuildSemSets` (come la guardia di `revealInTree`). Diagnosi
complicata dal fatto che tutte le istanze Orbit condividono lo stesso **identifier** (`com.visialab.lume`)
→ stessa config (registro multi-finestra + sessioni) e i file diagnostici venivano scritti da più build
di test insieme → confermato che NON era interferenza tra istanze con un **build isolato** (identifier
separato). Lezione: un `$effect` non deve leggere uno stato che — anche indirettamente, via funzioni
chiamate al suo interno — scrive; avvolgere in `untrack` ciò che non è una vera dipendenza.

**Ritocchi post-review:** frecce **indietro/avanti** spostate accanto al toggle terminale (dopo il
separatore); **badge branch** in top bar troncato (`max-width`+ellissi+tooltip) così un branch lungo non
sacrifica il nome del repo; **doppio toast su Ctrl+S** corretto (CodeMirror `Mod-s` E il dispatch globale
salvavano entrambi → guardia: dentro l'editor salva solo CodeMirror); conferma su **"Close all windows"**.

Verifica finale: `svelte-check` 198/0/0, `cargo test` 24/24, build release verificato a runtime (apre le
cartelle — lo scenario che il bug rompeva). Rilasciato in **v0.7.0**.

---

## Milestone 39 — multi-finestra + multi-cartella: lista repo e sessioni PER-FINESTRA (v0.7.1)

Bugfix dell'interazione tra il **selettore repo** (M37, più cartelle in una finestra) e le **istanze
multiple** (M14/M36). Le istanze condividono la **user-data-folder di WebView2** (stesso bundle id) →
condividono `localStorage` e la cartella di config. La M37 teneva la lista repo in `localStorage`
globale (letta una volta, scritta intera, senza sync) → tra finestre: **clobbering** (last-writer-wins →
repo persi) e **staleness** (una finestra non vedeva i cambi dell'altra). E le sessioni, keyed per
CARTELLA, si **sovrascrivevano** quando la stessa cartella era aperta in due finestre.

**Lista repo PER-FINESTRA.** Via `localStorage` per la lista repo: ora vive solo nello `$state` in
memoria di ciascuna finestra, persistita nella **sessione della cartella attiva** (campo `repos`).
`loadSession({repos:true})` la risemina all'avvio della finestra; uno *switch* di cartella NON la
sostituisce (resta quella della finestra). Le **impostazioni** (tema/keymap) restano globali di proposito.

**Sessioni PER-FINESTRA.** Chiave di sessione da `<folder>` a `<winKey>|<folder>`, dove `winKey` è una
**chiave finestra stabile** assegnata dal backend (`winsession::WinKey`): a differenza dell'`id`
(pid-nanos, cambia a ogni processo) sopravvive al riapri-tutte — passata via env `ORBIT_WIN_KEY` al
respawn, persistita in `windows-restore.json` (campo `key` su `WinEntry`, `#[serde(default)]` per
retrocompat) e restituita al frontend da `startup()`. Due finestre sulla STESSA cartella → `winKey`
diverse → file di sessione distinti → niente clobbering (tab/layout/repos). `load_state`/`save_state`
non cambiano (hashano una stringa qualsiasi): la chiave la compone il frontend.

Verifica: `cargo test` **25/25** (nuovo `resolve_key_priorita`: env → voce ripristinata → nuova),
`svelte-check` 198/0/0. **Runtime:** 2 istanze su cartelle diverse → repo bar indipendenti (`[IDE]` vs
`[docs]`, non più `[IDE,docs]`); 2 istanze sulla STESSA cartella → `key` distinte nel registro + 2 file
di sessione separati. `close-all`/`reopen-all` (M36) NON ri-testato a runtime (chiuderebbe anche le
finestre di lavoro dell'utente): coperto dai test `plan`/`resolve_key` + logica invariata (geom+key via
env). **Limite residuo accettato:** `last_session.txt` (avvio "nudo" senza set da ripristinare) resta
globale → il fallback può caricare la sessione di un'altra finestra; caso raro, non distruttivo (chiave
diversa al salvataggio). Rilasciato in **v0.7.1**.

---

## Milestone 40 — scaffale: regole per nome, rifiniture top-bar e salto-riga (v0.7.2)

**Scaffale per NOME (`byName`).** Oltre alla mappa per‑percorso, `.orbit/shelf.json` ha ora una sezione
`byName` (nome cartella → categorie): una **regola** che nasconde *tutte* le cartelle con quel nome —
anche **annidate** e anche quelle **ricreate dopo** (caso d'uso dell'utente: i `bin`/`obj` di una
soluzione C#, che ogni build rigenera). `isHidden(rel)` controlla, oltre ai percorsi, se un qualsiasi
**segmento** del path coincide con un nome a regola (match case‑insensitive, Windows). Nel `ShelfPicker`
un toggle **"Tutte le cartelle «nome»"** fa operare le spunte di categoria sulla regola invece che sul
singolo percorso (e si apre già in quella modalità se la regola esiste). La vista *Shelf* in fondo
all'Esplora mostra le regole come voci dedicate con una **×** per rimuoverle. La scorciatoia
**"Shelve noise folders"** ora usa regole‑per‑nome → cattura anche `node_modules`/`target`/`dist`/`.git`
**annidati** (prima solo al primo livello). API stato (`shelf.svelte.ts`):
`shelveByName`/`unshelveByNameCategory`/`unshelveName`/`isNameRuled`; `allCategories`/`byCategory`
includono le regole (`byCategory` ritorna anche `names[]`). Nessuna modifica al backend Rust.

**Top‑bar repo (rifiniture M37).** La tab del repo **attivo** mostra nome **+** branch **per intero**
quando c'è spazio: la repobar usa `width: max-content` (tetto `max-width: 100%`, oltre scrolla) e lo
`spacer` allinea a sinistra (`justify-content: flex-start`) invece di centrare, così non comprime la
striscia. Tutto resta **comprimibile** (`flex: 0 1`) → da finestra stretta nome/branch si accorciano con
ellissi invece di spingere fuori i controlli‑finestra; tolto il vecchio tetto `max-width: 96px` sul badge
branch (che sacrificava il nome del repo). Stringendo, il repo **selezionato** (non per forza il primo)
viene riportato in vista a ogni resize (`scrollIntoView` dentro `requestAnimationFrame`, fuori dal
callback del `ResizeObserver`). Frecce **indietro/avanti** spostate accanto all'icona del terminale,
dopo il separatore.

**Salto‑riga centrato.** F12 / Vai‑alla‑definizione / Vai‑al‑simbolo / indietro‑avanti centrano ora
verticalmente la riga di destinazione (`EditorView.scrollIntoView(pos, { y: "center" })`) invece di
incollarla al bordo alto/basso (era l'"altezza strana" segnalata).

Verifica: `svelte-check` **198/0/0**, `cargo test` **25/25** (invariati: nessuna modifica al backend).
Rilasciato in **v0.7.2**.

---

## Milestone 41 — perf terminale, robustezza e rete di test (v0.7.3)

Lotto di consolidamento ("in attesa di segnalazioni dal campo"): un guadagno di performance, fix
verificati e una rete di test anti-regressione. Nessuna feature nuova.

**Terminale: output PTY coalizzato.** Prima `pty.rs` emetteva un evento Tauri per ogni read da ≤4KB e
il frontend faceva una write a xterm per evento. Ora il lettore manda i chunk a un canale e un thread
*batcher* li coalizza in una finestra di ~8ms (tetto 256KB) → UN evento per finestra. Sotto output
pesante (log di build/test, `cat` di file grandi) crolla il numero di eventi IPC e di write/parse a
xterm; ordine dei byte preservato (canale FIFO, un produttore/un consumatore); la pulizia di sessione
+ `pty-exit` all'EOF passano al batcher. Buffer di lettura 4KB → 32KB (meno syscall). **Nota onesta:**
la CPU "alta" misurata sotto lo spinner di Claude era per lo più rendering WebGL a frame (scelta
utente), non gli emit; il coalescing agisce su IPC/throughput → si nota soprattutto con molto output.

**`fs-changed` selettivo.** Il watcher emetteva un ping senza payload → il frontend ricaricava TUTTO a
ogni evento FS (albero + git + *tutti* i file aperti riletti da disco + 3 config `.orbit`). Ora
`watcher.rs` accumula ed emette i **path cambiati**; `App.svelte` ricarica in modo selettivo: solo i
file aperti effettivamente cambiati, e i config `.orbit/{run,claude,shelf}.json` solo se toccati.
Fallback prudente: payload assente → comportamento storico (ricarica tutto). Meno I/O e IPC sul
percorso caldo quando Claude scrive sorgenti.

**Race di ricerca.** `search.svelte.ts`: aggiunto un token anti-stale (come `scanToken` di codeIndex)
→ digitando in fretta, i risultati di una query vecchia non sovrascrivono più quelli della corrente.

**Palette "Simboli progetto": freschezza.** Se lo scan finiva mentre la palette era aperta, i risultati
restavano congelati all'apertura. Ora `rescan()` li rinfresca (solo sorgente live) e clampa la
selezione — l'unico punto in cui i risultati cambiano sotto un indice fisso. (Le altre palette azzerano
già l'indice a ogni query: verificato, nessun bug — due "bug" segnalati da una ricognizione si sono
rivelati falsi allarmi.)

**Rete di test anti-regressione.**
- Logica pura dello scaffale estratta in `src/lib/state/shelfRules.ts` (`isHiddenIn` / `isNameRuledIn`
  / `groupByCategory`), così è testabile senza compilare i runes; `shelf.svelte.ts` vi delega (API e
  reattività invariate).
- **vitest** come *devDependency* — giustificazione (gate "deps al minimo"): è solo di sviluppo, **zero
  impatto su binario/bundle/runtime**; riusa l'infrastruttura Vite già presente. `vitest.config.ts`
  usa l'ambiente node e nessun plugin Svelte (i `.test.ts` importano solo `.ts` puro). 9 test su
  `shelfRules` (scaffale per-nome annidato/case-insensitive, raggruppamento).
- Backend: test di `is_excluded` (watcher) → `cargo test` 25 → 26.

Verifica: `vitest` 9/9, `svelte-check` 0/0, `cargo test` 26/26, build release OK. Rilasciato in **v0.7.3**.

---

## Milestone 42 — topbar uniforme e revisione notifica Claude (v0.7.4)

**Topbar più solida.** Tutti i "pill" della barra ora alla stessa altezza (22px; `.view`/`.navbtn`
erano 23). Il **badge contatore di Git** non è più inline (da inline allargava il bottone facendo
"saltare" i controlli a destra al suo comparire/sparire): ora è in **overlay assoluto** in uno spazio
riservato a destra dell'etichetta (`.gitview` padding-right + badge `position:absolute`), così legge
"Git ③" senza coprire il testo e **senza ricalcolare il layout**; in modalità solo-icone torna badge
d'angolo.

**Notifica "Claude ha finito / aspetta" — rivista.** Era cablata bene lato Orbit (bell del terminale →
`term.onBell` → `notifyTerminalBell` → pallino + toast) ma **non scattava mai**: Claude Code **non suona
il BEL di default**, va impostato `preferredNotifChannel: "terminal_bell"`. Ora, all'avvio di Claude da
Orbit (`launchClaude`/`resumeClaude`), scriviamo quel setting in `.claude/settings.local.json`
(locale/per-utente/git-ignored, merge NON distruttivo, solo se `bellNotify` è attivo e la chiave non
c'è già). Consegna resa robusta:
- **Quale repo / quale tab:** pallino di attesa sulla **tab della repo** (repo bar, sempre visibile →
  capisci quale repo ha finito anche se ne guardi un'altra: le tab di altre repo sono nascoste) oltre al
  pallino per-scheda esistente. Helper `repoNeedsAttention(root)` / `anyNeedsAttention()`.
- **Quando sei via:** Orbit in background → `requestUserAttention(Critical)` (taskbar evidenziata finché
  non torni, non un lampo) + **"● " nel titolo** (visibile in Alt-Tab/taskbar anche da minimizzato).
  Restano finché non apri quel terminale.
- **Focus più fine:** traccia il focus REALE del terminale (`terminals.focusedId`, via focusin/focusout
  sull'host xterm) → avvisa anche se stai editando in Orbit con la tab Claude attiva (prima il check era
  a livello-finestra e sopprimeva).

Verifica: `svelte-check` 246/0/0, `vitest` 9/9, `cargo test` 26/26 (nessuna modifica Rust). Il fix
topbar è stato verificato a video; la catena del bell **compila ed è cablata ma non provata end-to-end
con un bell reale** (da collaudare con Claude). Rilasciato in **v0.7.4**.

---

## Milestone 43 — vista Attività: unità di lavoro dai transcript Claude (v0.8.0)

Nuova vista **Attività**: dà una visione chiara di "cosa è stato fatto" e uno storico sempre accessibile, nello
scenario multi-repo / molte istanze di Claude Code aperte. Risolve lo "stream infinito" del terminale. **Sostituisce
la vecchia vista Chats.**

**Fonte dati (zero config, zero dipendenze nuove).** I transcript JSONL append-only di Claude Code in
`~/.claude/projects/<slug>/<sessionId>.jsonl`. Per riga: `cwd`, `gitBranch`, `timestamp`, `tool_use` (Write/Edit→file,
Bash→comando), `toolUseResult` (`type:create|update`, `filePath`, `structuredPatch` = patch riga-per-riga,
`userModified`). Tutto ricavabile senza LSP: solo `serde_json` (già presente).

**Modello: l'atomo è l'UNITÀ DI LAVORO, non la sessione.** Iterazione di design (mockup HTML approvato, poi rifinito
sull'uso reale a video):
- Digest per-sessione → scartato (una sessione lunga mischia cose diverse).
- Ibrido "fondi i prompt fino al commit" → provato e scartato: in una sessione **senza commit** degenerava in un
  mega-blocco con tutti i prompt insieme.
- Scelta finale **PROMPT-FIRST**: ogni prompt umano + il lavoro che innesca = un'unità; il `git commit`, se avviene,
  **etichetta** l'unità in cui cade; il cambio di branch è un confine duro. Etichetta = messaggio di commit, altrimenti
  il prompt (salvato **per intero** per il digest; l'etichetta corta è la prima riga).

**Backend** (`src-tauri/src/activity.rs` + `lib.rs`): `segment()` puro e testato + comando `scan_activity(limit)`
(scansiona TUTTI i progetti, ordina per recency, cap) + `watch_activity` (watcher `notify` su `~/.claude/projects` →
evento **`activity-changed`** debounced, per il refresh live). Parsing **difensivo** (formato interno a Claude Code,
può cambiare: c'è il campo `version`). `claude_sessions`/`session_preview` (vecchia Chats) restano ma inutilizzati.

**Frontend.** `activity.svelte.ts` (stato + `loadActivity` + toggle on/off per progetto `activityPrefs`, persistiti in
localStorage globale, per togliere il rumore). `ActivityPanel.svelte` = pannello sidebar (interruttori per progetto +
mini-stat: unità di oggi, ● live, pallino "aspetta input"). `ActivityBoard.svelte` = board grande nell'area editor
(nuovo kind documento `"activity"`), switcher **Timeline | List** e **digest nel pannello in basso** (riusa
`UnitDigest.svelte`). **Timeline**: asse del tempo **verticale e condiviso** (più recente in alto), repo in **colonne**,
**una riga per unità** messa nella colonna del suo repo → si legge la sequenza cronologica reale tra i repo (le matrici
per ora/giorno erano troppo sparse o disallineate; le colonne dense perdevano la sequenza). **▶ resume** 1-clic su
card/blocchi (riprende la sessione, passando prima sul repo giusto via `openFromList`).

**Sostituzione di Chats.** Vista sidebar `claude`→`activity` (il bottone in top bar apre pannello + board);
`ClaudeChatsView.svelte` e `claudeChats.svelte.ts` **eliminati**; `persist` normalizza una `sidebarView` salvata non
più valida (es. la vecchia `claude`) → Explorer.

Verifica: `cargo test` **31/31** (5 test nuovi sul segmentatore), `svelte-check` **248/0/0**, `vitest` 9/9, build OK.
Iterazione UI fatta a caldo (HMR) durante la review. **Da rilasciare in v0.8.0** (feature → minor bump). Residui /
possibili evoluzioni: diff/restore da `~/.claude/file-history` (T4); filtri ricchi (chip repo/branch/data); cache in
`.orbit/index` per transcript grandi; gestione delle sessioni di sola chat (oggi escluse perché senza lavoro).

---

## Milestone 44 — revisione copia/incolla (terminale + editor): affidabilità e fix doppio-incolla (v0.8.1)

Revisione di TUTTI i meccanismi di copia/incolla, partita da due sintomi segnalati dall'uso reale:
1. **Click destro nel terminale incolla due volte**, e "una volta che inizia, continua" (sticky/crescente).
2. **Selezioni testo nel terminale → sembra copiato → ma incolli il contenuto VECCHIO.**

**Cause.**
- Sintomo 1: in `Terminal.svelte` i listener su `host` (`contextmenu`/`mouseup`/`focusin`/`focusout`) erano
  aggiunti in `onMount` ma **mai rimossi** in `onDestroy` (ci si affidava alla GC del nodo). In **HMR** (e a ogni
  remount) si **accumulano** → un solo click destro fa partire N letture+`paste`. La firma "inizia e poi peggiora"
  è esattamente quella dei listener che si sommano.
- Sintomo 2: **tutti** i punti usavano `navigator.clipboard.*` con un `.catch(() => {})` che **ingoiava
  l'errore**. Su WebView2 la `writeText` asincrona può essere rifiutata (focus/attivazione utente; un TUI con
  mouse-reporting come Claude complica il quadro): l'errore spariva, la clipboard restava col valore VECCHIO e
  l'incolla restituiva appunto roba vecchia, senza alcun segnale. (+ possibile race: write non attesa vs read.)

**Fix — clipboard centralizzata.** Nuovo helper `src/lib/clipboard.ts` (`writeClipboard`→`bool`,
`readClipboard`→`string|null`): **preferisce il plugin Tauri `clipboard-manager`** (clipboard lato Rust, fuori
dai limiti del WebView) con **fallback** a `navigator.clipboard`; **non ingoia gli errori**, ritorna l'esito.
Tutti i consumer passano dall'helper: `Terminal.svelte`, `Editor.svelte`, `Explorer.svelte`,
`explorer.svelte.ts`, `WrapperComposer.svelte`. Migliorie di contorno:
- `Terminal.svelte`: i listener su `host` ora condividono un **`AbortController`** che `onDestroy` abortisce →
  rimozione in blocco — è questa la VERA cura del doppio-incolla "sticky" (niente più accumulo; **nessuna**
  guardia temporale, che scarterebbe incolli legittimi ravvicinati). `pasteFromClipboard` guarda `disposed`/`term`
  e avvolge `term.paste` in try/catch (no unhandled rejection se smonti il terminale durante l'await). **Copia su
  selezione silenziosa** se fallisce (capita a ogni drag); la copia **esplicita** (Ctrl+Shift+C) e l'incolla
  segnalano l'errore con un toast.
- `Editor.svelte`: `Cut` ora **copia PRIMA di cancellare** — se la clipboard fallisce non si perde il testo.
- `Explorer`/`WrapperComposer`: toast anche sul fallimento (prima solo sul successo).

**Dipendenza aggiunta** (gate "deps al minimo"): `@tauri-apps/plugin-clipboard-manager` — plugin **first-party**
Tauri, piccolo, e l'affidabilità della clipboard è UX di base; bypassa i bug noti dell'API web in WebView2.

**Stato.** **Fase A (solo frontend) FATTA e verificata:** `svelte-check` **251/0/0**, `vitest` **9/9**. Finché non
si registra il plugin l'helper fa fallback a `navigator` (quindi fix listener + toast d'errore sono GIÀ attivi).
**Fase B (backend) da fare** (richiede rebuild Rust → riavvia Orbit): in `Cargo.toml`
`tauri-plugin-clipboard-manager = "2"`, in `lib.rs` `.plugin(tauri_plugin_clipboard_manager::init())`, in
`capabilities/default.json` i permessi `clipboard-manager:allow-read-text`/`allow-write-text`. Rimandata di
proposito (l'utente sta usando Orbit): **da rilasciare** insieme ad altre piccole modifiche in arrivo (versione e
conteggi test finali al momento del rilascio).

Possibile residuo da sorvegliare: `App.svelte` `onAppContextMenu` lascia passare il menu nativo di WebView2 nei
`<textarea>` e la textarea nascosta di xterm È un textarea → in build installata, se l'handler in capture del
terminale non scattasse per primo, potrebbe concorrere al doppio-incolla; da irrobustire se il sintomo persiste.

---

## Milestone 45 — piccole rifiniture (v0.8.1)

Raccolta di piccoli fix verificati durante l'uso, da rilasciare insieme a M44.

- **Autosave al cambio di repo.** Cliccando un'altra repo nel selettore in top bar, un file modificato non
  veniva salvato: partiva il popup "X files have unsaved changes … will discard". Il cambio repo passa da
  `persist.switchFolder`, che chiedeva conferma invece di autosalvare — a differenza di blur-finestra e
  cambio-tab, che chiamano `autosaveAll` (il click sulla tab repo NON fa perdere il focus alla finestra,
  quindi l'autosave su blur non scattava). Ora `switchFolder`, se `settings.autosave` è ON, chiama
  `autosaveAll()` PRIMA del conteggio dei `dirty` → salvataggio silenzioso come altrove. Resta `dirty` (e
  quindi il confirm) solo ciò che l'autosave non tocca di proposito: i file in **conflitto** (cambiati anche
  su disco), per non calpestare un edit esterno. Solo frontend.
- **Notifica "Claude in attesa" — cliccabile e persistente.** Prima era un toast `info` che spariva dopo
  ~2,6 s, non cliccabile, e da "via" non compariva affatto. Ora: (1) il sistema toast ha una variante
  **`attention`** (`notifyAttention`/`dismissByKey` in `toast.svelte.ts`) **sticky** (niente timeout),
  **cliccabile**, con **✕** e **coalescing per `key`** (`bell:<id>` → un solo avviso per terminale);
  (2) `notifyTerminalBell` crea questo avviso (anche con Orbit in background → lo trovi al ritorno) e il
  click chiama **`goToTerminal(id)`** — passa alla repo giusta (`openFromList`, import dinamico per evitare
  il ciclo folders→persist→terminals) — ma se lo switch è **annullato** (edit non salvati) o **fallito**
  (cartella sparita) NON attiva nulla né azzera la notifica — poi mostra il pannello, attiva e mette a fuoco; (3)
  `clearAttention` ora rimuove anche l'avviso (`dismissByKey`) → aprendo il terminale sparisce; (4) **pill
  persistente in top bar** "✨ Waiting (N)" (`waitingTerminals`/`anyNeedsAttention`): click → vai al più
  vecchio in attesa, caret (se >1) → elenco di tutti; resta finché c'è almeno un Claude in attesa e da
  finestra stretta tiene icona+conteggio nascondendo la parola. I pallini su tab repo/terminale e il `●`
  nel titolo restano come traccia di fondo. Solo frontend. (`svelte-check` 251/0/0, `vitest` 9/9.)

**Rilasciato in v0.8.1** (build verificato su Windows, prima provato in locale poi pubblicato): `cargo test`
31/31, `svelte-check` 251/0/0, `vitest` 9/9; orbit.exe 5,75 MB, MSI 4,12 MB, NSIS 2,86 MB (+~0,3 MB sul binario
per il plugin clipboard + crate `arboard`). M44 e M45 rilasciate insieme. (La notifica della bell di Claude
— abilitata in M42 — resta da confermare end-to-end con un bell reale durante l'uso.)

---

## Milestone 46 — sistema di log diagnostico (v0.8.2)

Il doppio-incolla nel terminale **è ancora segnalato in v0.8.1**: il fix M44 (rimozione listener via
`AbortController`) curava l'accumulo in HMR, ma nella build installata (senza HMR) il listener è unico → la
causa reale è probabilmente un'altra (sospetto n.1: **menu contestuale nativo di WebView2** sulla `<textarea>`
nascosta di xterm, che `App.onAppContextMenu` lascia passare; oppure bracketed-paste della shell). Invece di
tirare a indovinare, **si strumenta**: un sistema di log per raccogliere ed esportare dati reali (utile anche
per i prossimi problemi segnalati sul campo).

**Frontend** `src/lib/state/logs.svelte.ts`: ring buffer in memoria (cap 2000), `log`/`logWarn`/`logError`,
cattura globale di `window.onerror`/`unhandledrejection`, persistenza **batched** su file (flush ~1,5s via
comando Rust), header con **versione app** (disambigua quale build ha prodotto il log) + userAgent. Tutto
**gated** dal toggle `settings.logging` (default ON, disattivabile → zero raccolta e zero I/O). Export: **copia
negli appunti** (`copyLogs`) + **rivela il file** (`revealLogFile`). Visualizzatore `LogViewer.svelte` (overlay
lazy) con filtro testo/livello, conteggio e pulsanti di export. Voce in **Impostazioni** ("Diagnostic logs" +
"Open logs…").

**Backend** (`lib.rs`): `app_version()`; `append_log(text)` → append a `app_config_dir/logs/orbit-<pid>.log`
(un file per processo → niente race tra finestre; rotazione oltre ~2 MB); `log_file_path()`.

**Strumentazione anti doppio-incolla**: `pasteFromClipboard(src)` logga la **sorgente** (contextmenu vs
keyboard) + timestamp; `clipboard.ts` logga quale backend usa (plugin vs fallback navigator) e i fallimenti; il
terminale logga mount/unmount (scopre componenti duplicati sullo stesso PTY) e un **evento `paste` del DOM** (=
incolla nativo, distinto dal nostro `term.paste`). Se per UN click destro compaiono entrambi → il raddoppio
viene dall'incolla nativo non soppresso; due `paste via contextmenu` ravvicinati → doppio trigger; un solo
percorso ma output doppio → shell/bracketed.

Verifica: `svelte-check` **253/0/0**, `cargo test` **31/31**, `vitest` 9/9; build OK (orbit.exe 5,76 MB, MSI
4,12 MB, NSIS 2,87 MB). **Rilasciato in v0.8.2** (l'utente ha scelto di pubblicare subito il logging). **NB: il
doppio-incolla resta APERTO** — questo rilascio aggiunge gli STRUMENTI per diagnosticarlo, non ancora il fix.

---

## Milestone 47 — fix doppio-incolla e copia nel terminale di Claude (v0.8.4)

Chiusura dell'indagine iniziata con M46 (log diagnostici). I log hanno **scagionato il frontend** (ogni click
destro = un solo `pasteFromClipboard`→`term.paste`, zero eventi `paste` DOM), e l'utente ha precisato: succede
**nel terminale di Claude**, l'Invio esegue **due volte** (input reale doppio), e il "copied to clipboard" è di
**Claude**. Radice: Claude è una **TUI** che attiva il **mouse-reporting** e ha copia/incolla propri.

- **Doppio-incolla:** col mouse-reporting attivo il click destro arrivava **sia a noi** (→ `term.paste`) **sia a
  Claude** (→ suo incolla) = due volte. **Fix (Approccio B, scelto dall'utente):** quando una TUI cattura il
  mouse (`term.modes.mouseTrackingMode !== "none"`) ci **facciamo da parte** — il click destro va alla TUI, che
  incolla col suo meccanismo nativo (una volta). Con una shell normale incolliamo NOI come prima. **Shift+click
  destro** e **Ctrl/Cmd+Shift+V** forzano sempre il nostro incolla. (Scartato l'Approccio A — sopprimere il
  tasto destro verso la TUI e incollare noi — perché B usa l'incolla nativo di Claude ed è il comportamento
  standard dei terminali.)
- **Copia "vecchia":** selezionando in Claude, lui copia via **OSC 52**, che xterm di Orbit **ignorava** → la
  clipboard di sistema non si aggiornava (incollavi il testo precedente). **Fix:** `registerOscHandler(52)`
  decodifica il base64 e scrive in clipboard (via il plugin). Ora "copied to clipboard" di Claude aggiorna
  davvero la clipboard di sistema.

Aggiunta anche strumentazione log (`onData→pty_write` con lunghezza/bracketed, `OSC52 copy`, mount/unmount) —
utile per la diagnosi e per il futuro. Verifica: `svelte-check` 253/0/0, `cargo test` 31/31, `vitest` 9/9, build
OK (orbit.exe 5,76 / MSI 4,12 / NSIS 2,87 MB). **Rilasciato in v0.8.4** su richiesta dell'utente. **NB:** B si
appoggia al fatto che Claude incolli sul click destro (il doppio osservato lo indica); se non fosse così, in
Claude resterebbero Ctrl+Shift+V / Shift+click destro → in tal caso si torna all'Approccio A.

**LEZIONE:** la strumentazione (M46) ha evitato altri fix a vuoto — i log hanno PROVATO che il frontend inviava
UNA sola volta, spostando l'indagine sull'interazione con la TUI (mouse-reporting + OSC 52), la causa vera. (Ero
partito col sospetto sbagliato — accumulo listener in HMR — corretto solo grazie ai dati.)

---

## Milestone 48 — indicatore "Usage": token/costo + stima limiti 5h/settimana (v0.8.5)

Ispirato a **Tokens 4 Breakfast**. Un indicatore in **status bar** (icona `gauge`, consumo di oggi) apre un
**popover**: card oggi/7g/30g, sparkline 14g, ripartizione per **modello** e **progetto**, efficienza cache,
"**valore piano**" (API-equivalent vs costo abbonamento) e sezione **Limits** (finestre mobili 5h/7g). Backend
`usage.rs` (`scan_usage`, `scan_usage_windows`), stato `usage.svelte.ts`, componente `UsageIndicator.svelte`.
**Zero dipendenze nuove** (solo `std` + `serde_json`); date senza `chrono` (algoritmo di Howard Hinnant
`civil_from_days`/`days_from_civil`). Riusa lo stesso reader dei transcript di [Attività](#milestone-43).

### Dati e prezzi
Ogni riga `assistant` ha `message.model` + `message.usage` (input/output/cache write/read). Il **costo NON è nei
transcript** → tabella prezzi per modello ($/Mtok), **verificata al centesimo** contro il `pricing.json` del
binario di T4B: Opus 5/25, Fable 10/50, Sonnet 3/15 (2/10 intro), Haiku 1/5; cache-write 1.25× input (5-min; NON
il 2× a 1h, conservativo), cache-read 0.10×. Il $ è **"equivalente API"** (non quanto si paga con l'abbonamento).

### Decisione: dedup per `message.id` (over-counting)
Al **resume/compattazione** Claude Code **ricopia** la storia in nuovi `.jsonl`, quindi lo stesso `message.id`
(usage identico) compare più volte → sommandolo i token erano gonfiati **~2.7×** (5.74B invece dei 2.15B reali,
su dati di test). `scan_usage`/`scan_usage_windows` deduplicano **globalmente per `message.id`**. Bug trovato
confrontando un calcolatore **Node indipendente** con l'output Rust (stessi interi ⇒ logica giusta; non si vedeva
perché entrambi contavano i doppioni). È lo stesso accorgimento di T4B ("duplicate log lines counted more than once").

### Decisione: limiti reali 5h/settimana → solo vie ToS-safe
La via "header API" (token OAuth di `.credentials.json` → header `anthropic-ratelimit-unified-*`) è **scartata**:
da ~gen 2026 quel token fuori da Claude Code riceve **HTTP 400** ("credential only authorized for use with Claude
Code") ed è **contro i ToS**, con **ban documentato** proprio per app di usage-tracking (issue #12021, docs legali
code.claude.com, dichiarazione ingegnere Anthropic). Analisi del binario di T4B: usa `api.anthropic.com/api/oauth/usage`
(token Claude Code) e/o il cookie `sk-ant-sid02` di claude.ai — **entrambe riusano credenziali d'abbonamento** =
stesso rischio. Scelta dell'utente: **niente credenziali**. Al loro posto:
- **stima** dai transcript: uso mobile ultime **5h** / **7g** + **budget** opzionale (barra gialla ≥75%, rossa ≥100%);
- **ancora manuale ToS-safe:** un link apre `claude.ai/settings/usage`; l'utente incolla il % reale, e da quel %
  + i token correnti deriviamo la capacità e mostriamo un % **reale estrapolato** live col consumo, con "synced
  Xm ago" e **forecast** ("~Xh al 100% a questo ritmo"). Deriva fra un sync e l'altro (finestra mobile ≠ sessione
  esatta di Anthropic): è il massimo pratico senza violare nulla.

### Verifica
`cargo test` (modulo usage) **9/9**, `svelte-check` **0/0** (255 file), **cross-check Node↔Rust esatto** su dati
reali (grand totale, finestre 5h/7g, per modello). Build release OK (orbit.exe **5,84 MB**, MSI **3,58 MB**, NSIS
**2,89 MB**). **Rilasciato in v0.8.5.**

---

## Milestone 49 — Git Graph + switch repo a schede + contatore globale usage (v0.8.6)

### Git Graph (nuova vista, stile IntelliJ/VS)
Un "graph log" in un tab dell'area editor. Backend `git_graph` (git.rs): revwalk su TUTTI i branch
(locali+remoti) + HEAD, ordine TOPOLOGICO+tempo, con **parent** e **ref** (branch/tag) per commit (via
libgit2 — `references` + `peel_to_commit` + `parent_ids`; **nessuna dipendenza nuova**). Il layout a
**corsie** vive nel frontend (`gitgraph.ts`, puro): assegna a ogni commit una lane dal DAG dei parent e
produce i segmenti (metà-superiore/inferiore) da disegnare, con colori per corsia e gestione di
biforcazioni/merge — verificato con un port dell'algoritmo su DAG reale (invarianti + rendering ASCII).
Vista `GitGraph.svelte` (tab kind "gitgraph", come Attività): grafo SVG + badge ref (branch corrente
evidenziato, tag, remoti) + messaggio/autore/data/hash; **click su un commit → diff** (`git_show`).
Apertura dal pannello Git (pulsante "Graph"). Fino a 500 commit.

### Switch repo "a schede"
Cambiando repo la sidebar non forza più Explorer: **mantiene la vista corrente** e non collassa l'albero —
le cartelle espanse sono memorizzate per repo (in RAM) e ripristinate al ritorno (`explorer.svelte.ts`
snapshot/restore delle espansioni; `persist.svelte.ts` cattura la vista corrente al posto del vecchio
"forza Explorer").

### Contatore globale (usage)
La ripartizione del popover Usage diventa "Breakdown" con switch **30d / All time** + riga **Total**: uso
di sempre per progetto e per modello, più l'aggregato globale (token o $).

Verifica: `svelte-check` 0/0 (257 file), `cargo check` OK, algoritmo del grafo verificato su dati reali.
Build release OK (orbit.exe **5,85 MB**, MSI **3,59 MB**, NSIS **2,90 MB**). **Rilasciato in v0.8.6.**

---

## Milestone 50 — pannello Usage embedded: la pagina claude.ai al posto dei contatori stimati (v0.8.7)

### Decisione: sostituire i contatori (M48–M49) con la pagina ufficiale incapsulata
I contatori dai transcript erano dati veri ma i **limiti** restavano stime (l'ancora manuale derivava,
vedi M48): l'utente ha scelto di mostrare direttamente la **pagina uso reale** di claude.ai. Il bottone
**Usage** in status bar apre `claude.ai/settings/usage` in una **webview figlia ancorata** sopra la
status bar (stile popover, 440×680 logici, chiusa da click fuori/toggle). È un **browser incapsulato e
nient'altro**: nessuno script iniettato, nessuna estrazione dal DOM, nessun riuso di credenziali — la
via "estrai i valori dalla pagina" è stata valutata e scartata (Consumer ToS §3.7 vieta l'accesso
"through automated or non-human means… script"; ban documentati per l'automazione, caso OpenClaw 2026).
Il login si fa UNA volta nel pannello e persiste nel profilo WebView2 dell'app. Rimossi `usage.rs`
(scan dei transcript a ogni avvio: centinaia di MB di I/O), `usage.svelte.ts`, tabella prezzi, ancora
e budget; `UsageIndicator.svelte` ridotto a bottone+Backdrop (**−1.703/+116 righe**). In cambio si
perdono i breakdown per progetto/modello e il costo API-equivalente (recuperabili da git se mancano).

### Tecnica
- **Webview figlia** (`Window::add_child`): feature cargo **`unstable`** di Tauri — flag di una
  dipendenza già presente, zero dipendenze nuove. Un iframe era impossibile (CSP `frame-ancestors`
  di claude.ai); una finestra separata (primo tentativo) funzionava ma non "dentro" l'IDE.
- Comandi `usage_panel_show/close/bounds/logout` (px logici = px DOM, rect calcolato dal frontend
  dall'ancora del bottone). La pagina remota NON è in alcuna capability → niente IPC, safe by design.
- **Testata sopra la webview** (34px di DOM, la webview copre solo il suo rect): mostra l'**account
  della CLI** (`claude_account` legge `~/.claude.json`, file locale — la sessione del pannello è
  indipendente da quella di Claude Code, così un disallineamento si vede subito) + **Log out**,
  apri-nel-browser, chiudi; `Esc` chiude il pannello. Il **bottone in status bar** mostra la parte
  locale dell'email della CLI, aggiornata **live** da `watch_claude_account` (notify non-ricorsivo
  sulla home filtrato su `.claude.json` — il file è sostituito con rename atomico, un watch diretto
  si perderebbe; debounce perché Claude Code lo riscrive spesso); tasto destro → menu con account
  e le stesse azioni senza aprire il pannello.
- **Log out senza automazione**: `claude_logout_local` cancella i **cookie del profilo WebView in
  locale** (`ICoreWebView2CookieManager::DeleteAllCookies` via `webview2-com`+`windows-core`, GIÀ
  transitive nell'albero → costo zero; cfg(windows)) — nessuna richiesta a claude.ai, e il
  localStorage (dove vivono le impostazioni di Orbit) è uno store separato, intatto (verificato).
  Funziona anche a pannello chiuso; se aperto, il pannello viene poi ricaricato sul form di login
  (`usage_panel_logout` → `claude.ai/logout`, che resta il fallback puro per macOS/Linux).
  Scartato `clear_all_browsing_data` di Tauri: pulisce l'intero profilo, incluso il localStorage.
- **Account preconfigurati = SOLO email** (`settings.claudeAccounts` + `ClaudeAccounts.svelte`,
  add rapido dell'account CLI corrente): ogni voce del menu **copia l'indirizzo negli appunti**
  da incollare nel form di login. Valutato e SCARTATO l'autofill iniettato (compilare il campo +
  click via script): è "accesso via script" ai sensi dei ToS e sul form c'è hCaptcha invisibile
  che rileva proprio gli eventi sintetici — il flusso resta: logout → incolla email → codice via
  mail a mano. (L'autofill NATIVO di WebView2 resta disponibile: è il motore del browser.)
- **Deadlock da manuale**: su Windows creare una webview da un comando **sincrono** blocca per sempre
  (`build()` attende un message pump che il comando occupa) → finestra bianca. I comandi DEVONO
  essere `async` (documentato nel codice). Diagnosi: log su file (lo stdout della dev non bastava),
  poi verifica autonoma via **CDP** (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`):
  click sul bottone pilotato da script, screenshot della pagina, toggle di chiusura verificato.
  Attenzione ai falsi allarmi da screenshot PrintWindow con processi non DPI-aware (bitmap
  virtualizzata): fanno fede le coordinate Win32 + il viewport CDP.

### Verifica
`svelte-check` 0/0 (256 file), vitest 9/9, `cargo test` 31/31 (usciti i 9 test del modulo usage).
Test end-to-end via CDP: apertura ancorata corretta (x=832, y=95 logici), pagina loggata con i
meter reali (sessione 27%, settimana 26%), chiusura al secondo click; testata con account CLI
corretto ("CLI: <email> · <org>"), click su Log out → la pagina del pannello atterra su
`/login?from=logout`, ✕ chiude. Secondo giro E2E: bottone status bar = "rd2-sw" (account CLI),
menu contestuale con account/azioni, logout locale via cookie → login page, e `orbit.settings`
presente in localStorage prima E dopo la cancellazione cookie. Terzo giro: "Add current" salva
l'email, la voce di menu la copia DAVVERO negli appunti di sistema (verificato via Get-Clipboard),
rimozione e persistenza ok. Build release OK (orbit.exe **5,85 MB**, MSI **3,59 MB**, NSIS
**2,89 MB** — footprint invariato: il COM per i cookie è compensato dall'uscita di `usage.rs`).
**Rilasciato in v0.8.7.**

---

## Milestone 51 — Attività per CHAT: colori di sessione + lente Chats (v0.8.8)

### Problema e decisione
Nella colonna di un repo le unità di chat diverse scorrevano indistinte. E poiché `claude --resume`
riprende SOLO la sessione intera (non da un messaggio specifico), la **chat è l'atomo naturale di
navigazione e ripresa** — senza però buttare la segmentazione per unità (M43), che resta l'atomo del
racconto temporale. Due mosse complementari:
- **Timeline (resta per unità)**: colore **stabile per sessione** (hash dell'id → palette di 10 tinte,
  `sessionColor`) su ogni blocco + **intestazione di chat** (`sessStart`: prima unità di una "corsa" di
  sessione nella SUA colonna) quando la conversazione cambia scendendo — le chat parallele o riprese si
  distinguono senza rompere l'asse temporale condiviso (vincolo di design M43: si colora, non si raggruppa).
- **Lente "Chats"** (sostituisce List, che duplicava la cronologia della timeline): **una card per
  conversazione** (titolo aiTitle o id breve, repo, branch, prompt/step, churn, commit, live), raggruppate
  per giorno; selezione → **`ChatDigest.svelte`** nel pannello sotto: TUTTA la conversazione, ogni prompt
  per esteso in ordine cronologico col suo esito (ora, tipo, churn, hash), e **Resume this chat**.
Il filtro testuale ora matcha anche il titolo della sessione; il digest per unità della Timeline resta
(`UnitDigest`), con il pallino-chat anche nella barra del digest.

### Indagine: "perché card distinte sembrano la stessa chat?"
Verificato sui transcript reali (36 file in un progetto): **zero overlap di uuid tra file** → nessuna
storia ricopiata dal resume (Claude Code ≥2.x continua lo STESSO file al resume; 1 file = 1 chat
logica — l'over-counting della M48 riguardava versioni precedenti). Le card "gemelle" sono sessioni
GENUINAMENTE diverse che iniziano tutte con lo stesso prompt (la scorciatoia "Recupera contesto…"),
per cui l'aiTitle generato esce quasi identico (20+ titoli fotocopia su 36). Rimedi:
- **sottotitolo "significativo"** sulla card: l'unità con l'ultimo commit (o la più grossa per churn)
  — è ciò che la chat ha FATTO a distinguerla, non come è iniziata;
- **"started \<giorno, ora\>"** nel meta del ChatDigest;
- fix di `commit_message` per lo stile **heredoc** di Claude Code (`-m "$(cat <<'EOF' …"`): prima la
  label mostrava "$(cat <<'EOF'" al posto del messaggio (+ unit test).

### Verifica
`svelte-check` 0/0 (258 file), vitest 9/9, `cargo test` 32/32 (nuovo test per il commit heredoc).
Verifica visiva via CDP sull'istanza dev: timeline con 168 intestazioni di chat e 10 colori distinti
su dati reali; lente Chats con 45 card (prima card "Recupera contesto sul progetto": 14 prompts ·
14 steps · +2017 −977 · 1 commit) e digest con i 14 prompt integrali e il bottone di resume; dopo il
fix heredoc il sottotitolo mostra il messaggio di commit vero. Build release OK (orbit.exe **5,85 MB**,
MSI **3,59 MB**, NSIS **2,89 MB** — invariato: feature quasi tutta frontend). **Rilasciato in v0.8.8.**

---

## Milestone 52 — Anteprima HTML + anteprima nella split view (v0.8.9)

### Problema e decisione
I file `.html` avevano solo il sorgente (CodeMirror li evidenzia già via language-data), senza
l'equivalente dell'anteprima markdown. Nuovo `HtmlView.svelte` (~25 righe) + toggle **Source ⇄
Preview** in `EditorArea` anche per `.html/.htm` (icona `globe`, riusa `.mdtoggle` e
`OpenFile.preview`). **Zero dipendenze nuove.**

Scelte chiave:
- **iframe su asset protocol (`convertFileSrc`), NON `srcdoc` dal buffer**: il documento mantiene
  il suo URL reale, quindi ancore `#…` (TOC), immagini/CSS relativi e data URI funzionano nativi.
  Con `srcdoc` + `<base href>` i fragment link risolverebbero contro la base → navigazione via
  dalla pagina. Contropartita: l'anteprima legge il DISCO, non il buffer → il toggle **salva prima**
  se il documento è dirty (`toggleWithSave`), e al cambio esterno l'iframe si rimonta via
  `OpenFile.rev` (`{#key rev}`).
- **`sandbox="allow-same-origin"` SENZA `allow-scripts`**: gli script della pagina non girano mai —
  il WebView padre ha accesso all'IPC di Tauri e una pagina arbitraria non deve poterlo raggiungere
  (stesso threat model per cui `markdown.ts` sanifica con DOMPurify). Se in futuro serviranno gli
  script, andrà valutato un opt-in esplicito.
- **Apertura sempre in sorgente** (nessun `htmlMode` in Settings per ora): un HTML si edita più
  spesso di quanto si legga; l'anteprima è a un click.

### Anteprima nella split view (sorgente + anteprima affiancate)
Richiesta a seguire: vedere editor e anteprima INSIEME. Il blocco era architetturale: `preview`
era una proprietà del DOCUMENTO (`OpenFile`, pool condiviso) → lo stesso file in due riquadri
mostrava per forza la stessa vista. Migrato lo stato a livello di GRUPPO:
- `EditorGroup.previews: string[]` (tab in anteprima in QUEL riquadro); `togglePreview(groupId,
  path)`; `setPreview` resta path-only ma agisce sul gruppo attivo (compatibile con la vista Docs).
  Lo stato segue la tab in `moveTab`/split, si pulisce in `closeTab`/`closeFile`, si rimappa nel
  rename, e si **persiste in sessione** (`SavedGroup.previews`; sessioni vecchie: fallback a
  `initialPreview`, stesso comportamento di prima).
- Bottone **"Open preview to the side"** accanto al toggle (`openPreviewToSide`): apre un gruppo
  affiancato già in anteprima e lascia il sorgente di qua; se un altro gruppo la mostra già, lo
  attiva soltanto.
- **Markdown**: l'anteprima affiancata si aggiorna LIVE mentre digiti (i due riquadri condividono
  il buffer del pool). **HTML**: legge il disco → nuovo `OpenFile.diskRev` incrementato a ogni
  save e reload esterno; `HtmlView` è dentro `{#key diskRev}` → l'iframe si ricarica a ogni
  salvataggio e a ogni modifica esterna. (`rev` non era riusabile: bumparlo al save farebbe
  rimpiazzare il doc a CodeMirror, con salto del cursore.)

### Verifica
`svelte-check` 0/0 (259 file), vitest 9/9. Collaudo nell'app reale via CDP
(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` + `LUME_DIR`/`LUME_FILE` sul dossier brevetto di Visia,
HTML self-contained da ~434 KB): toggle → iframe `http://asset.localhost/...` con title/h1/45k
caratteri renderizzati (screenshot nativo `PrintWindow`: tipografia, web font e layout corretti —
lo screenshot CDP del target principale mostra l'iframe bianco perché OOPIF, artefatto noto);
click su ancora del TOC → scroll interno (0 → 645 px); secondo toggle → ritorno a CodeMirror.
Split view: "preview to the side" → 2 gruppi (editor | iframe) verificati nel DOM e a schermo;
le anteprime per gruppo sopravvivono al reload (persistenza sessione); live-reload provato
modificando il file su disco (marker nel body comparso nell'iframe senza interazione, poi file
ripristinato byte-identico). Attenzione ai test via CDP: un commento appeso DOPO `</html>` finisce
fuori da `documentElement.outerHTML` (falso negativo). Fix post-collaudo: il bottone side aveva
anche lui il `margin-left:auto` di `.mdtoggle` → finiva all'estremo opposto del toggle (ora
`.mdtoggle.side`, margine fisso). Build release OK (orbit.exe **5,85 MB**, MSI **3,59 MB**, NSIS
**2,90 MB** — invariato: feature tutta frontend). **Rilasciato in v0.8.9.**

---

## Ambiente di sviluppo verificato
- Node 24, npm 11, Rust 1.92 (host `x86_64-pc-windows-msvc`).
- MSVC C++ tools + Windows SDK 26100 (Visual Studio Community 2026).
- WebView2 runtime 148 presente.
- Dev su **Windows**; il codice è scritto per essere cross-platform (vedi milestone
  finale per la nota sul build Linux/macOS, non testabile direttamente da qui).
