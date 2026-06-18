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
- Milestone [9](#milestone-9--produttività-gestione-file-persistenza-findreplace-quick-open) · [10](#milestone-10--terminali-multipli) · [11](#milestone-11--git-discard--cronologia) · [12](#milestone-12--startup-lazy--decorazioni-git-companion) · [13](#milestone-13--configurazioni-di-esecuzione-esegui--loop-con-claude) · [14](#milestone-14--selettore-branch-status-bar--istanze-multiple--distribuzione) · [15](#milestone-15--scaffale-cartelle-messe-da-parte-per-categoria) · [16](#milestone-16--rifinitura-grafica-ide--terminale) · [17](#milestone-17--polish-grafico-2-diff-toast-focus-title-bar-tab) · [18](#milestone-18--impostazioni-font-cursore-fluido-uireadme-in-inglese) · [19](#milestone-19--zoom-font-vs-look-visual-studio-2026) · [20](#milestone-20--verso-il-look-visual-studio-git-gutter-card-densità) · [21](#milestone-21--indagine-footprint--webgl-opt-in) · [22](#milestone-22--manutenzione-doc-pulizia-repo-refactor) · [23](#milestone-23--più-linguaggi--esperienza-markdowndocs) · [24](#milestone-24--integrazione-claude-code) · [25](#milestone-25--refactor--pulizia-pre-release) · [26](#milestone-26--split-view-riquadri-editor-affiancati) · [27](#milestone-27--rifiniture-split-view--terminale-flottante) · [28](#milestone-28--revisione-pre-release-v020) · [29](#milestone-29--git-completo-vai-al-simbolo-chat-claude-v030) · [30](#milestone-30--viewer-immagini-e-pdf-drop-file-menu-contestuali-multi-detach-v031) · [31](#milestone-31--titolo-finestra-wrapper-claude-open-with-menu-a-sezioni-v032) · [32](#milestone-32--temi-glifi-file-per-linguaggio-notifica-claude-trim-davvio-v040) · [33](#milestone-33--la-finestra-ricorda-posizione-e-dimensione) · [34](#milestone-34--navigazione-del-codice-scorciatoie-configurabili-esegui-script-in-sviluppo)
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

## Milestone 34 — navigazione del codice, scorciatoie configurabili, esegui script (in sviluppo)

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
**Non rilasciato**: la prossima release attende le feature secondarie in sviluppo in parallelo.

---

## Ambiente di sviluppo verificato
- Node 24, npm 11, Rust 1.92 (host `x86_64-pc-windows-msvc`).
- MSVC C++ tools + Windows SDK 26100 (Visual Studio Community 2026).
- WebView2 runtime 148 presente.
- Dev su **Windows**; il codice è scritto per essere cross-platform (vedi milestone
  finale per la nota sul build Linux/macOS, non testabile direttamente da qui).
