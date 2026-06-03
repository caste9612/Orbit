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

## Ambiente di sviluppo verificato
- Node 24, npm 11, Rust 1.92 (host `x86_64-pc-windows-msvc`).
- MSVC C++ tools + Windows SDK 26100 (Visual Studio Community 2026).
- WebView2 runtime 148 presente.
- Dev su **Windows**; il codice è scritto per essere cross-platform (vedi milestone
  finale per la nota sul build Linux/macOS, non testabile direttamente da qui).
