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
- Milestone [9](#milestone-9--produttività-gestione-file-persistenza-findreplace-quick-open) · [10](#milestone-10--terminali-multipli) · [11](#milestone-11--git-discard--cronologia) · [12](#milestone-12--startup-lazy--decorazioni-git-companion) · [13](#milestone-13--configurazioni-di-esecuzione-esegui--loop-con-claude) · [14](#milestone-14--selettore-branch-status-bar--istanze-multiple--distribuzione) · [15](#milestone-15--scaffale-cartelle-messe-da-parte-per-categoria) · [16](#milestone-16--rifinitura-grafica-ide--terminale) · [17](#milestone-17--polish-grafico-2-diff-toast-focus-title-bar-tab) · [18](#milestone-18--impostazioni-font-cursore-fluido-uireadme-in-inglese) · [19](#milestone-19--zoom-font-vs-look-visual-studio-2026) · [20](#milestone-20--verso-il-look-visual-studio-git-gutter-card-densità) · [21](#milestone-21--indagine-footprint--webgl-opt-in) · [22](#milestone-22--manutenzione-doc-pulizia-repo-refactor) · [23](#milestone-23--più-linguaggi--esperienza-markdowndocs) · [24](#milestone-24--integrazione-claude-code) · [25](#milestone-25--refactor--pulizia-pre-release) · [26](#milestone-26--split-view-riquadri-editor-affiancati) · [27](#milestone-27--rifiniture-split-view--terminale-flottante) · [28](#milestone-28--revisione-pre-release-v020) · [29](#milestone-29--git-completo-vai-al-simbolo-chat-claude-v030) · [30](#milestone-30--viewer-immagini-e-pdf-drop-file-menu-contestuali-multi-detach-v031) · [31](#milestone-31--titolo-finestra-wrapper-claude-open-with-menu-a-sezioni-v032) · [32](#milestone-32--temi-glifi-file-per-linguaggio-notifica-claude-trim-davvio-v040) · [33](#milestone-33--la-finestra-ricorda-posizione-e-dimensione) · [34](#milestone-34--navigazione-del-codice-scorciatoie-configurabili-esegui-script) · [35](#milestone-35--segui-il-file-attivo-badge--pin-del-terminale-flottante-v050) · [36](#milestone-36--finestre-multiple-chiudi-tutte-e-riapri-tutte-c) · [37](#milestone-37--selettore-repo-in-top-bar-più-cartelle-aperte-una-attiva-v060) · [38](#milestone-38--autosave-quick-prompt-keymap-custom-default-markdown-nav-indietroavanti-highlight-semantico-cc-v070) · [39](#milestone-39--multi-finestra--multi-cartella-lista-repo-e-sessioni-per-finestra-v071) · [40](#milestone-40--scaffale-regole-per-nome-rifiniture-top-bar-e-salto-riga-v072) · [41](#milestone-41--perf-terminale-robustezza-e-rete-di-test-v073) · [42](#milestone-42--topbar-uniforme-e-revisione-notifica-claude-v074) · [43](#milestone-43--vista-attività-unità-di-lavoro-dai-transcript-claude-v080) · [44](#milestone-44--revisione-copiaincolla-terminale--editor-affidabilità-e-fix-doppio-incolla-v081) · [45](#milestone-45--piccole-rifiniture-v081) · [46](#milestone-46--sistema-di-log-diagnostico-v082) · [47](#milestone-47--fix-doppio-incolla-e-copia-nel-terminale-di-claude-v084) · [48](#milestone-48--indicatore-usage-tokencosto--stima-limiti-5hsettimana-v085) · [49](#milestone-49--git-graph--switch-repo-a-schede--contatore-globale-usage-v086) · [50](#milestone-50--pannello-usage-embedded-la-pagina-claudeai-al-posto-dei-contatori-stimati-v087) · [51](#milestone-51--attività-per-chat-colori-di-sessione--lente-chats-v088) · [52](#milestone-52--anteprima-html--anteprima-nella-split-view-v089) · [53](#milestone-53--via-il-pannello-usage-nuovo-logo-e-rifiniture-v0810) · [54](#milestone-54--chat-affiancate-nel-pannello-terminale-v0811) · [55](#milestone-55--look-visual-studio-2026-chat-affiancate-rifinite-nomi-e-colori-delle-schede-v090) · [56](#milestone-56--movimento-fluido-del-layout-barra-repo-riordinabile-e-centrata-v091) · [57](#milestone-57--modalità-leggera-pannelli-comprimibili-in-striscia-simmetria-delle-icone-fix-reveal-e-trascinamento-chat) · [58](#milestone-58--chiudi-tutte-le-schede-zoom-delle-immagini) · [59](#milestone-59--aggiornamenti-da-github-nessuna-modifica-persa-alla-chiusura-bug-noti) · [60](#milestone-60--codelens-apri-con-senza-predefinito-rifiniture-per-la-10) · [61](#milestone-61--versione-e-aggiornamenti-sempre-in-vista-nelle-impostazioni) · [62](#milestone-62--prestazioni-tutti-i-punti-caldi-misurati-prima-e-dopo) · [63](#milestone-63--stili-del-cursore-per-editor-e-terminale) · [64](#milestone-64--impostazioni-in-una-finestra-grande-a-categorie) · [65](#milestone-65--cambio-repo-un-movimento-solo-anche-quando-i-file-tardano) · [66](#milestone-66--riaprire-orbit-e-ritrovare-tutto-terminali-chat-posizione-nei-file) · [67](#milestone-67--documentazione-del-codice-in-docs) · [68](#milestone-68--quattro-correzioni-trovate-scrivendo-la-documentazione) · [v1.1.0](#versione-110) · [69](#milestone-69--tante-repo-nella-barra-compressione-da-destra-presa-sempre-libera-repo-in-una-finestra-nuova) · [v1.2.0](#versione-120) · [70](#milestone-70--vista-solution-nellexplorer-come-il-solution-explorer-di-visual-studio) · [v1.3.0](#versione-130) · [71](#milestone-71--rilasci-da-github-actions-si-pubblica-da-qualunque-pc) · [72](#milestone-72--scaffale-nella-vista-solution-sei-chat-affiancate-editor-diviso-in-righe-e-colonne) · [73](#milestone-73--lo-scaffale-secondo-giro-regole-per-tutte-le-repo-nodi-veri-categorie-undo) · [v1.4.0](#versione-140) · [74](#milestone-74--notifiche-errori-che-restano-storico-nella--chat-in-attesa-in-un-avviso-solo) · [v1.5.0](#versione-150)
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
  git potrebbero non combaciare con quelli dell'albero → decorazioni assenti per quei file. (Risolto nella M59.)

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
`civil_from_days`/`days_from_civil`). Riusa lo stesso reader dei transcript di [Attività](#milestone-43--vista-attività-unità-di-lavoro-dai-transcript-claude-v080).

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
(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` + `LUME_DIR`/`LUME_FILE` su un documento reale,
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

## Milestone 53 — via il pannello Usage, nuovo logo e rifiniture (v0.8.10)

Prima tappa del piano concordato il 2026-10-06: M53 pulizia → M54 chat affiancate (divise per repo) →
M55 status line di Claude configurabile da Orbit.

### Rimozione del pannello Usage (M48–M50)
Decisione dell'utente: il pannello "non funziona bene e non serve". La pagina claude.ai incapsulata
chiedeva un login separato da quello della CLI (due sessioni indipendenti da tenere allineate), mentre
per i limiti reali ora esiste una via ufficiale: Claude Code passa `rate_limits.five_hour` /
`rate_limits.seven_day` (percentuale + reset, solo abbonamenti Pro/Max, dopo la prima risposta) al
comando della **status line** — verificato sulla documentazione ufficiale. Li mostrerà la M55,
direttamente nella barra di Claude. Rimossi:
- frontend: `UsageIndicator.svelte` e `ClaudeAccounts.svelte` (−515 righe), il bottone in `StatusBar`,
  `settings.claudeAccounts` (il valore già salvato in localStorage è ignorato e sparisce al primo salvataggio);
- backend (`lib.rs`): `usage_panel_show/close/bounds/logout`, `claude_account`, `claude_logout_local`,
  `watch_claude_account` con `AccountWatchState`;
- **dipendenze** (gate "deps al minimo", qui in negativo): la feature `unstable` di `tauri` (serviva solo
  a `Window::add_child`, la webview figlia) e le dipendenze dirette `webview2-com` / `windows-core`
  (servivano solo a cancellare i cookie). Restano nell'albero come transitive di tauri.
- Residuo innocuo: il cookie di login di claude.ai resta nel profilo WebView di Orbit, ma nessun codice
  lo usa più.

### Pulizia
- Codice morto della vecchia vista Chats (`claude_sessions`, `session_preview`, `ClaudeSession`),
  inutilizzato dalla M43: `lib.rs` 950 → 652 righe insieme al blocco Usage. Riunito il commento sulle
  finestre flottanti, spezzato a metà dall'inserimento dei comandi di log.
- `CLAUDE_SECTION` (il testo di *Update CLAUDE.md for Claude*) diceva ancora che le chat recenti si
  riprendono dal menu Claude: rilanciare il comando avrebbe reintrodotto la frase sbagliata in CLAUDE.md.
  Ora coincide con il CLAUDE.md attuale.

### Scratchpad in testo semplice
`.orbit/scratch.md` → `.orbit/scratch.txt` (richiesta utente): per appunti e prompt il Markdown non serve,
il toggle anteprima e l'evidenziazione erano rumore. Migrazione al primo utilizzo (`scratch.ts`): se esiste
solo il vecchio `.md` viene rinominato (contenuto intatto) e le tab aperte vengono riallineate con
`renameOpenPaths`; se esistono entrambi non si tocca nulla. `.gitignore` ignora entrambi i nomi (il `.md`
finché la migrazione non è avvenuta).

### Area editor che si stringe da sola
Richiesta utente: quando l'area editor non ha tab aperte si stringe alla larghezza minima (220 px) e il
pannello terminale — le chat di Claude — si prende il resto; aprendo un file torna com'era.
`layout.editorCollapsed` è derivato a runtime da un `$effect` in `App.svelte` e non è persistito:
`terminalWidth` non viene mai toccato. Dettagli:
- collasso con **400 ms di ritardo**, espansione immediata: all'avvio (`workspace.ready`) e durante lo
  switch di repo (`resetDocs` → `loadSession`) i gruppi sono vuoti per un attimo, e il layout non deve
  "pompare" — ogni cambio ridimensiona i PTY e fa ridisegnare Claude;
- solo con una cartella aperta (senza cartella il benvenuto con i suggerimenti resta largo) e con il
  pannello terminale visibile;
- da collassata lo splitter è sostituito da uno spazio fisso (trascinarlo non avrebbe effetto visibile)
  e il benvenuto si riduce al solo logo.

### Fix: la "riga nera" in fondo al terminale
Segnalata dall'utente (screenshot): una fascia nera sotto l'ultima riga del terminale, che a volte spariva
ridimensionando la finestra. In M27 si era colorato il contenitore `.term` col fondo del tema, senza
effetto. Due cause, trovate misurando il DOM via CDP:
- **il FitAddon contava spazio inesistente**: calcola le righe sull'altezza del **genitore** di `.xterm`
  letta con `getComputedStyle` (col `box-sizing: border-box` è padding incluso) e sottrae solo il padding
  di `.xterm`. Il padding però stava sul genitore (`.term`, 6+6 px), quindi le righe erano calcolate su
  12 px in più. Dipendeva dall'altezza: se il resto della divisione per l'altezza di riga superava i
  12 px restava una striscia vuota, se era inferiore lo schermo sbordava e tagliava l'ultima riga. Per
  questo "a volte spariva".
  Ora xterm si apre in un div interno senza padding (`.term-fit`); il padding resta su `.term`.
- **il vuoto era nero**: xterm 6 dà il colore del tema solo allo `.xterm-scrollable-element` che avvolge
  le righe. Sotto c'è `.xterm-viewport`, che copre tutto `.xterm` e da `xterm.css` è `#000`: il colore
  del contenitore (il fix di M27) era coperto. Ora il viewport ha il colore del tema. L'avanzo sotto
  l'ultima riga, sempre meno di una riga, è dello stesso colore del fondo e non si vede.

Effetto collaterale corretto: ora il FitAddon riserva davvero i 14 px della scrollbar (prima il padding
orizzontale li compensava per caso), quindi 1–2 colonne in meno e la scrollbar non copre l'ultima colonna.
Collaudo via CDP (istanza dev isolata): altezza del terminale variata px per px su 25 valori → mai sbordo,
avanzo sempre in [0, altezza riga), colore nell'avanzo `rgb(30, 30, 30)` (= `#1e1e1e`). Il cambio di
righe (33 → 32) cade esattamente dove previsto. Screenshot del caso peggiore (19 px di avanzo):
fondo uniforme, nessun artefatto agli angoli. Vale anche per la finestra flottante (stesso componente).

### Nuovo logo: "Orbita sfumata"
Scelto dall'utente tra i loghi dei mockup UI (canvas "Orbit — direzioni UI", tavola "Logo"): pianeta
sfumato blu→viola, anello inclinato e satellite. Sostituisce l'icona raster del pianeta con anello.
- **Sorgente unica vettoriale**: `app-icon.svg` (1024 px: piastrella blu notte con bagliore e bordo
  sottile, simbolo in scala 35 sulla griglia 24×24). `npx tauri icon app-icon.svg` genera le icone; nel
  repo restano solo i 6 file versionati da sempre in `src-tauri/icons`. `app-icon.png` (README) è la
  sua resa a 1024 px; `public/favicon.png` quella a 64 px.
- **Tratto dell'anello**: nella prima resa era 1,6 (sulla griglia 24), per reggere i 16 px, ma a
  1024 px risultava pesante; scelto 1,2 con opacità 0,8. Controllate a vista le rese a 1024, 32 e
  16 px: a 32 l'anello si legge, a 16 resta il pianeta su piastrella.
- **Nell'interfaccia** `Logo.svelte` disegna lo stesso simbolo in SVG inline, al posto della PNG da
  128 px (`orbit-icon.png`, eliminata): nitido a ogni dimensione. Anello e satellite usano i colori
  del tema (`--color-ink-muted`, `--color-ink`), quindi si leggono anche con Orbit Light. Il pianeta
  resta nei colori del brand. Id del gradiente da `$props.id()`, perché il logo compare più volte nella
  stessa pagina. Zero dipendenze nuove.

### Associazioni dei file: niente più script
Segnalazione dell'utente: il doppio clic su un `.bat` apriva Orbit invece di eseguirlo. Causa,
verificata nel registro: per ogni estensione di `bundle.fileAssociations` l'installer NSIS di Tauri
(`APP_ASSOCIATE`) non si limita ad "Apri con", ma diventa il gestore **predefinito**
(`HKCU\Software\Classes\.ext` = "Orbit document", il valore precedente in "Orbit document_backup").
Dove Windows non ha una scelta utente sopra, vince Orbit: `.bat`, `.cmd` e `.sh` erano suoi, mentre
`.ps1` e `.txt` no, perché avevano una scelta utente. (`.disabled` non è mai stato associato da Orbit.)
- Dall'elenco escono `bat`, `cmd`, `ps1`, `sh`, `bash`: gli script tornano a eseguirsi col doppio clic.
- Hook NSIS `src-tauri/windows/hooks.nsh` (`NSIS_HOOK_POSTINSTALL`, via
  `bundle.windows.nsis.installerHooks`) che ripulisce le chiavi lasciate da una versione precedente,
  **solo** dove c'è il backup di Orbit: ripristina il gestore originale, oppure toglie il valore
  predefinito così torna a valere quello di sistema. Serve perché l'aggiornamento da solo non basta:
  il vecchio disinstallatore parte solo se si sceglie "disinstalla prima", e comunque riscrive il
  backup (stringa **vuota** se non c'era nulla) invece di cancellare. Un predefinito vuoto in HKCU
  nasconderebbe quello di sistema e lascerebbe il `.bat` senza programma.
- Resta da decidere (prossime milestone): per le altre estensioni Orbit diventa comunque il
  predefinito dove manca una scelta utente; "solo Apri con" (OpenWithProgids) richiederebbe
  un'installazione delle associazioni scritta a mano. Anche `.py` e `.js` (eseguibili col doppio clic
  se c'è l'interprete) restano associati.

### Documentazione
README e ARCHITECTURE senza Usage, con scratchpad e auto-collasso. Corrette le imprecisioni trovate
rileggendo: ARCHITECTURE diceva ancora che lo switch di repo forza la vista Explorer (falso dalla M49) ed
elencava i tipi di documento senza `activity`/`gitgraph`; nel README mancava `npm run test`; l'indice di
queste NOTES si fermava alla M43; il chunk di avvio indicato (~492 KB) era fermo a una misura precedente.

### Verifica
`svelte-check` 0/0 (257 file), vitest 9/9, `cargo test` 32/32 senza warning (i comandi rimossi non avevano
test), build frontend OK: chunk di avvio **521 KB** (174 KB gzip), xterm 343 KB, CodeMirror 76 KB.
Collaudo nell'app reale via CDP, su un'istanza dev **isolata** (`WEBVIEW2_USER_DATA_FOLDER` separato, così
il browser process dell'Orbit installato e in uso non viene toccato; progetto di prova con un vecchio
`scratch.md`), finestra 1280 px:
- avvio senza tab → editor 220 px, pannello 784 px, spazio fisso al posto dello splitter;
- click sullo scratchpad → `scratch.md` rinominato in `.txt` con contenuto identico, tab "scratch.txt"
  aperta come testo semplice, editor 564 px e pannello di nuovo a 440 px (larghezza salvata intatta);
- chiusura della tab → ancora largo dopo 120 ms, collassato dopo 820 ms; la riapertura non migra nulla.

Gli screenshot confermano il benvenuto ridotto al logo e Claude a tutta larghezza.
**Attenzione nei collaudi futuri:** chiudere la finestra dev riscrive `windows-restore.json` nella config
dir, condivisa con l'app installata (e lascia la sessione e il log del suo pid): fare backup e ripristino
prima e dopo, come in questo giro.

Build release OK: orbit.exe **5,73 MB**, MSI **3,50 MB**, NSIS **2,84 MB**, rispettivamente −0,12, −0,09 e
−0,06 MB rispetto alla v0.8.9 (via la feature `unstable` e le dipendenze del pannello). Installer controllato
sugli script generati: l'`installer.nsi` include l'hook e lo chiama dopo l'installazione; MSI e NSIS
associano 49 estensioni e nessuno script. **Rilasciato in v0.8.10.**

---

## Milestone 54 — chat affiancate nel pannello terminale (v0.8.11)

Seconda tappa del piano del 2026-10-06: vedere più chat di Claude insieme, **divise per repo** (decisione
dell'utente). La status line di Claude configurabile, prevista come M55, è stata annullata dall'utente.

### Come si usa
- Fino a **4 riquadri** nel pannello terminale. Ogni repo ha i suoi: cambiando repo si ritrova la sua
  disposizione.
- Si aprono dal bottone **Split** nella testata del pannello (*New Claude to the side*, *New terminal to
  the side*, le schede già aperte in *Show to the side*, e la scelta *Layout*: Automatic / Side by side /
  Stacked), dal menu Claude (*Open Claude to the side*), dalla lente Chats di Attività (*To the side*
  accanto a *Resume this chat*), oppure **trascinando una scheda** su un riquadro: al centro la mostra lì,
  vicino a un bordo la affianca da quel lato (una scheda già visibile si sposta).
- Ogni riquadro ha una **testata**: titolo, pallino d'attesa, ingrandisci (gli altri restano vivi),
  finestra flottante e "togli dallo split" (il terminale resta tra le schede).
- Il **riquadro attivo** è quello col focus (click dentro o sulla testata). Una scheda non visibile
  cliccata, o una nuova scheda (+), va nel riquadro attivo.
- **Pannello a tutta larghezza**: bottone nella testata del pannello. L'editor resta montato ma nascosto
  (`display:none`), così non perde stato; il flag e la scelta di layout sono salvati in sessione.
- **"Claude ti aspetta"**: se quel riquadro è già visibile e Orbit è a fuoco, pulsa solo la sua testata
  (e la scheda), senza toast.

### Tecnica
- **Nessun rimontaggio.** Tutti i terminali erano già montati nella stessa superficie, nascosti con
  `display:none`. La superficie ora è una CSS grid: ai terminali visibili `placement()` assegna
  `grid-column`/`grid-row`, gli altri restano nascosti (e `fitSafe` li salta). Claude non si interrompe,
  lo storico resta, e il resize dei PTY lo fanno i ResizeObserver già presenti in `Terminal.svelte`.
- **Logica pura** in `terminalLayout.ts` (`gridFor`, `addPane`, `movePane`, `removePane`,
  `replacePane`), testata con vitest come `shelfRules.ts`.
- **Disposizione automatica a punteggio.** La prima versione usava regole fisse ("affiancati se ogni
  riquadro resta largo 480 px, altrimenti impilati"): nel collaudo, 4 chat nel pannello stretto
  finivano impilate in strisce da 172 px, circa 7 righe, inutilizzabili per Claude. Ora `gridFor`
  confronta le disposizioni possibili (affiancati; griglia, cioè con 3 il primo alto a sinistra e con 4
  la 2×2; impilati) e sceglie quella in cui il riquadro più piccolo resta più vicino a 480×260 px
  (punteggio `min(min(w/480,1), min(h/260,1))`); a parità vince affiancati, poi griglia, poi impilati.
- **Stato** in `terminals.svelte.ts`: `panes` per repo (chiave `rootKey`) e `zoomId`. `activate()`
  mantiene l'invariante "`activeId` è sempre visibile"; `dropFromPanes` pulisce alla chiusura o
  all'estrazione in finestra flottante; `syncActiveTerminalToRoot` riporta l'attivo dentro i riquadri
  della repo.
- **Drag** pointer-based come le schede dell'editor (con `dragDropEnabled` l'HTML5 DnD non funziona):
  `elementFromPoint` sul riquadro, la zona è il bordo più vicino se entro il 25%, altrimenti il centro.
- Zero dipendenze nuove; icone `columns`/`rows`/`grid`/`maximize`/`minimize` in `Icon.svelte`.
- Niente scorciatoie da tastiera per ora: con il focus nel terminale, una combinazione Ctrl+lettera
  rischierebbe di arrivare anche al PTY come carattere di controllo.

### Verifica
`svelte-check` 0/0 (259 file), vitest 21/21 (12 nuovi), `cargo test` invariato (nessuna modifica Rust).
Collaudo via CDP su istanza dev isolata (stessa procedura della M53, config condivisa salvata e
ripristinata): un terminale → due impilati nel pannello da 784 px → a tutta larghezza due affiancati
(497 px) → tre con il primo alto a sinistra → quattro in griglia 2×2 → ingrandimento e ripristino →
riquadro tolto (resta come scheda) → scheda trascinata sul bordo destro di un riquadro (zona evidenziata,
inserita subito dopo) → editor di nuovo visibile. In ogni passo xterm resta dentro il suo riquadro. Dopo
il passaggio al punteggio: 4 chat nel pannello stretto in griglia 2×2 da 385×348 px. Screenshot
controllati. Build frontend OK: chunk di avvio **531 KB** (177 KB gzip), +10 KB perché il pannello
terminale fa parte del caricamento iniziale. Build release OK: orbit.exe **5,74 MB**, MSI **3,50 MB**, NSIS
**2,84 MB**, invariati rispetto alla v0.8.10 (feature tutta frontend). Prima del rilascio l'utente l'ha
provata su un'istanza dev aperta sul repo. **Rilasciato in v0.8.11.**

---

## Milestone 55 — look Visual Studio 2026, chat affiancate rifinite, nomi e colori delle schede (v0.9.0)

Nata come "esperimento minimo" sull'aspetto (branch `ui-vs2026`, 2026-10-06/07) e cresciuta in una
milestone intera. Modello dichiarato dall'utente: **l'ultima Visual Studio 2026**. Giudizio sull'Orbit
di prima: "troppo rotondo, effetto comic/SMS, poco professionale", colori troppo blu-notte, icone e
tessere colorate dei file da cambiare; pannelli a card e top bar invece vanno bene. La status line di
Claude configurabile (era la M55 pianificata) è stata **annullata** dall'utente: non riproporla.

### Palette campionata, non immaginata
Una prima palette "a memoria" (#2d2d30/#252526, accento blu) era sbagliata. I temi di VS vivono nel
`privateregistry.bin` (apribile solo da admin), quindi l'utente ha fornito uno screenshot di VS 2026
Dark (18.10, schermo 4K a 125%) e i colori sono stati **campionati pixel per pixel** con uno script
PowerShell (moda del colore per zona, profili di pixel attraverso i confini, istogramma dei colori saturi):
- cornice/titolo/toolbar `#1c1c1c`; editor `#1e1e1e`; barra schede `#262626` con scheda attiva
  `#282828` **senza alcuna linea d'accento** (copre il bordo inferiore della barra); tool window
  `#282828`; input `#212121` con bordo `#373737`; bottoni e dropdown `#353535`; separatori interni
  `#2e2e2e`/`#373737`; bordi delle card `#454545` su gap di ~8 px di cornice; status bar `#141414`;
  testo `#ffffff`/`#d7d7d7`; numeri di riga `#8a8a8a`; riga corrente `#272727`; scrollbar `#999999`.
- **accento viola `#9184ee`**: bordo della tool window attiva e dell'input a fuoco. VS 2026 non usa più
  il blu. Nel tema è l'accento "Auto"; l'utente lo cambia dai preset, a cui si aggiunge **Ambra**.
- la struttura a card di VS 2026 (pannelli con bordo 1 px su una cornice più scura, angoli appena
  arrotondati) è la stessa di Orbit dalla M19: niente da stravolgere.
- misure a 125%: schede documento 25 px, barra dropdown 22, titolo tool window 27, loro toolbar 22,
  righe dell'albero 26 (= Orbit). Testo di menu ≈ 12 px.

Tonalità: provato il corpo della sidebar scuro come l'editor (`#1e1e1e`); l'utente ha preferito tornare
alla tonalità "strumenti" `#282828` come la sua testata, fedele alle tool window di VS. Resta il token
`--color-panel` (default surface-2), nessun tema lo sovrascrive.

### Il tema controlla anche la forma: `Theme.look`
Prima i temi erano solo colori; per cambiare l'aspetto serviva toccare i componenti. Ora
`settings.svelte.ts` ha `Theme.look` (`fontSans`, `radii`, `heights`, `iconStroke`, `iconSet`,
`flatGlyphs`) e `applySettings` lo traduce in variabili CSS, rimosse quando il tema non le definisce:
- **scala dei raggi** `--r-xs…--r-xxl` (3/4/6/8/10/12 px di default): tutti i ~150 `border-radius`
  fissi dei componenti (26 file) sono stati portati sulla scala con una sostituzione a regola; il tema
  VS li porta a 2/2/3/4/4/6. Restano fissi solo i `999px` delle pillole.
- **densità** `--h-tabs`/`--h-head` (32/30 → 28/28 nel tema VS).
- **font** `--font-sans` → Segoe UI Variable Text nel tema VS (è nel sistema; Inter resta self-hosted
  per gli altri temi).
- **icone**: `--icon-stroke` uniforma il tratto (1.5 nel tema VS) e `Icon.svelte` ha un set `fluent`
  per le icone principali del chrome (geometria più squadrata, rx 1.5); le altre cadono sul set base.
- **glifi dei file**: `flatGlyphs` → tessera a contorno sottile nel colore del linguaggio, niente fondo
  pieno.
- svista corretta lungo la via: le variabili definite solo da alcuni temi (`color-accent-soft`,
  `color-panel`) restavano appiccicate cambiando tema → `ALL_THEME_VARS` e `removeProperty`.

**Terminale legato al tema** (richiesta utente): `xtermTheme()` costruisce il tema xterm dai colori
del tema attivo (sfondo = editor, testo = ink, cursore = accento, selezione = `--cm-selection`) con set
ANSI scuro/chiaro; prima era fisso `#1e1e1e` (coincideva col tema VS per caso e stonava altrove, Orbit
Light compreso). Si riapplica al volo da `$effect` su tema/accento.

### Predefinito e migrazione
Dalla 0.9.0 il tema predefinito è **Visual Studio 2026 Dark** (primo anche fra gli swatch in
Impostazioni). Le impostazioni salvate dalle versioni precedenti hanno sempre `theme` (il vecchio default
veniva persistito anche se mai scelto), quindi chi aggiorna non vedrebbe mai il nuovo look: al primo
avvio con la 0.9 si passa al nuovo tema UNA volta, marcato da `uiV09: true` nelle impostazioni; da lì
in poi la scelta dell'utente comanda. Orbit Dark, Eclipse, Slate e Light restano disponibili e invariati.

### Chat affiancate: il trascinamento era sbagliato di progetto
Segnalazione: "trascini a destra e si splitta in basso". In M54 il rilascio decideva solo l'**ordine**
dei riquadri, mentre affiancati o impilati lo sceglieva la disposizione automatica in base allo spazio:
nel pannello stretto due riquadri finivano sempre impilati. Nuovo modello in `terminalLayout.ts`:
**colonne di righe** (`Layout = string[][]`). Un rilascio a destra/sinistra crea una colonna, uno
sopra/sotto una riga (`insertPane`, che sposta un riquadro già visibile invece di duplicarlo); al centro
scambio (`replacePane`); `arrangeAuto` sceglie fra affiancati/griglia/impilati con il punteggio
480×260 di M54; `placeBeside` è l'"affianca" senza direzione (colonna se ci sta, altrimenti riga sotto
l'attivo). Per repo: `layouts` + `autoLayout`: la disposizione resta adattiva finché l'utente non
esprime un'intenzione (rilascio con direzione, separatore trascinato, *Side by side*/*Stacked*);
*Automatic* la rende di nuovo adattiva. `termSplit` globale (0.8.11) rimosso da layout e sessione.
- Collaudo CDP con eventi mouse veri: il trascinamento della **linguetta** funzionava anche prima del
  fix della direzione; l'utente afferrava probabilmente la **testata del riquadro**, che non era
  trascinabile → ora lo è (stesso meccanismo, cursore a manina).
- **Ridimensionamento** (richiesta utente: "non posso dimensionare trascinando"): riquadri posizionati in
  modo **assoluto** in px dalle frazioni (`PaneSizes {shape, cols, rows[]}` per repo, valide finché la
  forma — righe per colonna — resta quella; cambiata la forma si riparte equi), separatori `.psplit`
  verticali fra colonne e orizzontali fra righe con pointer capture e minimo ~140 px. Una griglia CSS
  non bastava: righe di altezze diverse per colonna non si esprimono con `span`. `gridFor` rimosso.
- Trucco per collaudare mentre la finestra dev dell'utente è aperta: lanciare DIRETTAMENTE
  `target/debug/orbit.exe` con profilo WebView2 isolato + porta di debug, agganciato allo stesso vite
  (un secondo `tauri dev` fallisce: prova a ricompilare l'exe in uso). Lezione sull'HMR: ogni modifica
  a un modulo di stato (`*.svelte.ts`) ricaricata a caldo ricrea lo stato mentre i componenti tengono i
  riferimenti vecchi → finestra "bloccata"; serve riavviare la dev.

### Nomi e colori delle schede
Richiesta: "rinominare chat e terminali, differenziarle per colore, nome chiaro in automatico". Poi la
correzione: "i nomi di default sono lunghissimi e senza senso" (erano i titoli OSC delle shell: percorsi).
- `shortName` minimo e numerato per tipo: `Claude 1`, `pwsh 2`, `cmd 1`, `bash 1`, `wsl 1`; le run
  config e gli script tengono il loro nome. Contatori per tipo, stabili (niente rinumerazioni).
- `customTitle` dalla **rinomina**: doppio clic su linguetta o nome in testata, campo inline (Invio /
  Esc / vuoto = torna all'automatico).
- `autoTitle` dal titolo che il programma imposta via **OSC 0/2** (`term.onTitleChange`): usato SOLO per
  le chat — Claude Code vi scrive un riassunto della conversazione — e solo come sottotitolo attenuato
  nella testata (si tronca per primo) e nel tooltip; i titoli delle shell sono rumore e vengono ignorati.
- `color` dalla **stessa palette di Attività** (`TAB_COLORS` = `SESSION_COLORS`, duplicata per non creare
  il ciclo terminals → activity → claude → terminals), a rotazione; colora l'icona della linguetta e una
  barra di 3 px nella testata; passa alla finestra flottante e torna al redock. Menu col **tasto destro**
  sulla linguetta: Rename, Open to the side, Floating window, i 10 colori (swatch; spunta su quello
  attivo — `MenuItem.swatch` nuovo in `ContextMenu`), Close. Bottone ✨ **New Claude chat** accanto al +.
- Nomi e colori NON sono persistiti, come i terminali stessi.

### Verifica
`svelte-check` 0/0 (259 file), vitest **20/20** (modello di layout: insert/remove/replace/arrange/
placeBeside), `cargo test` invariato (nessuna modifica Rust). Collaudi CDP su istanza dev isolata (profilo
WebView2 separato, config condivisa salvata e ripristinata, tracce rimosse):
- tema: font Segoe UI Variable, raggi 3/4 px, tratto 1.5, palette campionata; confronto A/B a schermo con
  Orbit Dark;
- D&D con eventi mouse veri: scheda → bordo destro nel pannello stretto = due colonne da 385 px; bordo
  sinistro = colonna a sinistra; centro = scambio; menu Stacked/Side by side/Automatic corretti;
- nomi brevi; separatori: colonne 505/265 px dopo +120 px, righe 258/438 dopo −90 px, reset equi al
  cambio di forma; nessun errore in console.
Collaudo manuale dell'utente su `tauri dev` aperto sul repo (tema, trascinamento, rinomina, colori).
Build release OK: orbit.exe **5,74 MB**, MSI **3,50 MB**, NSIS **2,84 MB** (invariati rispetto alla 0.8.11:
nessuna modifica Rust). Screenshot del README rifatti con il nuovo tema. **Rilasciato in v0.9.0.**

Lezioni di collaudo: `tauri dev` **riavvia** l'app quando cambiano `tauri.conf.json`/`Cargo.toml` (il bump
di versione ha ucciso l'istanza isolata a metà screenshot: nuovo pid, finestra alle dimensioni di default);
vite ricarica la pagina quando cambia `package.json` o quando scopre nuove dipendenze da ottimizzare (il
primo caricamento lazy del Markdown). La scansione di Attività legge TUTTI i transcript in modo sincrono:
con centinaia di sessioni e transcript da decine di MB impiega 1–2 minuti (il `TODO(perf)` in
`activity.rs` sulla cache per mtime resta valido).

---

## Milestone 56 — movimento fluido del layout, barra repo riordinabile e centrata (v0.9.1)

Richiesta utente (2026-10-07): "quando cambio repo con un'altra configurazione di finestre le
transizioni e i ridimensionamenti sono molto scattosi". Poi: la transizione "parte dopo un po'";
infine riordino dei repo per trascinamento, barra "popolata dal centro" e un lampeggio del bottone
*Open folder…* in alto a sinistra durante il cambio repo. Branch `smooth-layout`.

### Perché scattava
Nessuna misura dei pannelli aveva una transition: al cambio repo larghezze (sidebar, pannello),
visibilità, `terminalMaximized` e il collasso dell'editor cambiavano in momenti diversi, ognuno di
colpo; xterm rifittava a ogni scatto e ridimensionava il PTY, quindi Claude si ridisegnava più volte.
In più la sidebar lampeggiava (veniva applicata la vista salvata della repo di destinazione e poi
ripristinata dal chiamante).

### Modello: un "movimento" di layout
`layout.svelte.ts` è l'orologio: `beginMotion()` accende `layout.animating` e ritorna `end()`
(annidabile, con contatore: `switchFolder` lo tiene aperto attraverso gli `await`); `animate(fn)` è la
forma sincrona; `motionUntil()` è l'istante di fine, `motionMs()` la durata (220 ms, o 0 se
l'impostazione è spenta). I componenti accendono le transition CSS SOLO con la classe `.animating`
(sidebar: width; pannello: width + flex-grow; editor: flex-basis/grow/min-width/border/opacity), così
il trascinamento degli splitter resta immediato. Mostra/nascondi di sidebar e pannello usano
`transition:slide|global` sulla radice del componente (durata 0 finché `workspace.ready` è false:
niente animazione all'avvio). L'editor "nascosto" (pannello a tutta larghezza) è passato da
`display:none` a larghezza 0 + `visibility:hidden`: display non si anima.
- **Terminali**: `scheduleFit` consulta `motionUntil()` e fa UN fit ~40 ms dopo la fine del movimento
  (tetto 1,5 s) invece di un `pty_resize` per frame.
- **Riquadri delle chat**: transition permanente su left/top/width/height, spenta dalla classe
  `.surface.still` mentre la superficie si ridimensiona (ResizeObserver → flag `resizing` per 160 ms),
  durante un movimento della shell o trascinando un separatore (`paneDrag`): in quei casi devono
  seguire frame per frame. Prima avevo provato la classe accesa solo durante il cambio (`panes`):
  classe e stile arrivavano nella stessa mutazione DOM ma la transition NON partiva, mentre lo stesso
  cambio fatto a mano da console partiva in tutti gli ordini; causa non chiarita (qualcosa nel flush
  di Svelte forza un ricalcolo di stile in mezzo?), la soluzione "sempre accesa salvo `still`" la evita.
- **Impostazione "Smooth panel transitions"** (default ON) che scrive `--motion-ms` (220ms/0ms).
  Scoperta: sul PC dell'utente Windows ha gli effetti di animazione spenti → `prefers-reduced-motion:
  reduce` è vero e ogni transition durerebbe 0: la preferenza di sistema NON viene seguita, comanda
  l'impostazione di Orbit (l'utente ha chiesto proprio le animazioni).

### Il cambio repo come movimento unico
Misura via CDP (campionamento per frame dal clic sulla scheda repo), prima della correzione:
andando verso una repo senza file, primo movimento a 45 ms (allargamento dell'editor!) e un SECONDO
movimento a 450–570 ms (collasso). Causa: `switchFolder` azzera `rootPath` per qualche decina di ms e
l'effetto del collasso in App leggeva quell'istante come "ci sono file" → espandeva subito; poi, con la
sessione nuova senza tab, collassava col ritardo di 400 ms previsto per la chiusura dell'ultima scheda.
Correzione: `loadSession` decide `editorCollapsed` SUBITO dalle tab salvate (insieme alle larghezze);
l'effetto in App non tocca nulla finché `rootPath` è null e tiene il ritardo solo per la chiusura
manuale; la sessione di destinazione si legge in parallelo al salvataggio di quella corrente
(`load_state` prefetch, `opts.raw`); le schede terminale della nuova repo compaiono appena la cartella
è aperta (`onRootOpened`), prima dei file; `keepSidebar` evita il lampeggio della sidebar. Dopo:
Orbit→Hive un solo movimento 41–210 ms (editor, pannello e sidebar insieme), Hive→Orbit 57–230 ms. I
~40 ms iniziali sono i round trip verso Rust (salva + leggi).
- **Lampeggio di "Open folder…"**: con `rootPath` null la sidebar mostrava lo stato "nessuna cartella"
  per qualche frame. Nuovo flag `workspace.switching` (true dentro `switchFolder`): Explorer/Git/
  Docs/Search e i bottoni della testata restano montati coi dati vecchi finché arriva la nuova cartella.

### Barra dei repo
- **Riordino per trascinamento** (TopBar): stesso approccio pointer-based delle schede editor (HTML5
  DnD è spento per il file-drop del SO). Soglia 5 px (sotto = click = cambio repo); pointer capture;
  la scheda presa segue il puntatore con `transform`, quelle fra origine e destinazione scivolano di
  una posizione (transition 150 ms); la LISTA cambia solo al rilascio (`folders.moveFolder`), con un
  frame di classe `settling` senza transition perché il DOM riordinato coincide già col visivo;
  `suppressClick` scarta il click che segue il rilascio. L'ordine si persiste da solo: l'autosave di
  sessione serializza `folders.list` in `repos`.
- **Centrata**: `justify-content: center` sullo spacer della top bar; da stretto la repozone riempie lo
  spazio e scorre come prima.

### Verifica
CDP su istanza dev isolata: massimizza/ripristina, collasso/espansione, sidebar, cambio disposizione
dei riquadri con 7–9 valori intermedi campionati; ridimensionamento della finestra e trascinamento di
splitter e separatori senza ritardo (riquadri che riempiono la superficie a ogni frame); a riposo
nessuna transition sulle larghezze; cambio repo misurato come sopra; barra centrata (scarto 0 px);
trascinamento con eventi mouse veri Orbit,Hive → Hive,Orbit con repo attiva invariata e nessun
transform residuo; click semplice che cambia repo; durante lo switch nessun frame con lo stato vuoto.
`svelte-check` 0/0 (259 file), vitest 20/20, nessuna modifica Rust. Collaudo manuale dell'utente sulla
finestra dev ("l'animazione sembra perfetta"). Build release OK: orbit.exe **5,74 MB**, MSI **3,51 MB**,
NSIS **2,85 MB** (+0,01 sugli installer: solo frontend); chunk d'avvio 536 KB (179 KB gzip).
**Rilasciato in v0.9.1.**

---

## Milestone 57 — modalità leggera, pannelli comprimibili in striscia, simmetria delle icone, fix "Reveal" e trascinamento chat

Segnalazioni dell'utente (2026-10-09), cinque punti: (1) aprendo un file con Orbit, nella sua cartella
comparivano `.claude` e `.orbit` → una modalità più leggera per i file sparsi; (2) barra laterale e pannello
delle chat comprimibili, e in quella modalità aperti compressi; (3) il trascinamento delle chat per
affiancarle "spesso non funziona"; (4) "Reveal in Explorer" su un file apre solo Explorer; (5) icone che
sembrano decentrate (il "+" in alto, nuova cartella…): controllo generale di simmetria e pulizia. Branch
`light-mode-strips`.

### Da dove venivano `.claude` e `.orbit`
Con un file come argomento ("Apri con", doppio clic) la sua cartella diventava un progetto a tutti gli
effetti: il terminale di default avviava Claude, e prima `ensureBellChannel` scriveva
`.claude/settings.local.json` (M42); l'indice dei simboli scansionava la cartella e salvava la cache in
`.orbit/index/`; il watcher la osservava ricorsivamente (un file in Download, o nella radice di un disco = tutto
l'albero sotto); e la cartella entrava fra le schede repo e nel "riapri tutte", con la sua sessione.

### Modalità leggera (scelta utente: "leggera + Apri come progetto")
- `startup()` restituisce `light: true` quando il primo argomento è un FILE e non c'è una cartella esplicita
  (`LUME_DIR`). Il frontend chiama `persist.openLight(dir, file)`: `workspace.light`, barra laterale e pannello
  compressi, `openRoot(dir, { light: true })` — watch NON ricorsivo (nuovo parametro `recursive` di
  `watch_start`) e niente stato git — e il file aperto. In modalità leggera: niente sessione letta né salvata
  (`saveSessionNow` e l'autosave escono), niente `register_window` (quindi niente "riapri tutte", e chiuderla non
  tocca il set da ripristinare), niente scheda repo, niente indice (`initIndex`/`rescan`), niente bell di Claude
  (`ensureBellChannel`); la top bar nasconde Scratchpad/Claude/Esegui (scriverebbero nella cartella) e la status
  bar il conteggio dei simboli. Titolo della finestra = nome del file.
- Al posto delle schede repo, il bottone **"Open «X» as project"**: `X` è il repo git che contiene il file
  (nuovo comando `project_root`: il primo antenato con `.git`, anche FILE per i worktree; NON `.orbit`, che le
  versioni precedenti creavano proprio nelle cartelle dei file sparsi) o, senza repo, la sua cartella.
  `persist.promoteLight()` ne fa un progetto normale: sessione del progetto (per finestra, M39), lista repo,
  indice, git, watch ricorsivo; i file aperti restano aperti, le schede terminale passano al progetto
  (`adoptTerminals`), la barra laterale si riapre sull'Explorer. "Apri cartella" sulla cartella stessa del file
  fa lo stesso; aprirne un'altra esce dalla modalità leggera.
- Correzione collegata: le schede terminale aperte quando non c'era nessuna cartella (avvio "nudo" senza
  sessione) restavano vive ma nascoste alla prima cartella aperta; ora la seguono (`switchFolder`).
- Le `.orbit`/`.claude` già create dalle versioni precedenti nelle cartelle dei file aperti da soli restano: vanno
  tolte a mano.

### Pannelli comprimibili in striscia (scelta utente: stile IntelliJ/VS)
Prima barra laterale e pannello terminale si potevano solo NASCONDERE (vista attiva in top bar / Ctrl+B, ✕ /
Ctrl+`), senza un comando sul pannello. Ora si COMPRIMONO in una striscia sul bordo della finestra
(`PanelStrip.svelte`) spessa quanto la status bar (22 px con il bordo da 1 verso il contenuto, fondo chrome):
le barre incorniciano la finestra (richiesta dell'utente: "stessa dimensione della barra in basso"). A sinistra
le viste (Explorer, Git col pallino delle modifiche, Search, Docs, Activity); a destra le chat e i terminali della
repo, nella loro tinta, col pallino d'attesa che pulsa — un clic riapre il pannello su quella vista o scheda. In
cima a ogni striscia "»"/"«" lo riapre; nelle testate di barra laterale e pannello "«"/"»" lo comprime, dopo un
separatore che lo distingue dalle azioni della vista. Doppia freccia e non un'icona "pannello con freccina": a
13 px la freccina diventava una macchia (visto a schermo, ingrandito). Lo stato è quello di sempre
(`sidebarVisible`/`terminalVisible`, salvati in sessione): compresso = non visibile.

### Il movimento: `panelSlide`
Campionando i frame via CDP, il primo tentativo con `slide` di Svelte aveva tre difetti: la striscia compariva
intera di colpo (con `flex: 0 0 22px` la larghezza animata non conta: comanda la base); la barra laterale
scendeva a 2 px e restava lì ~40 ms prima di sparire (Svelte anima `border-width` da 1 a 0, ma Chromium
arrotonda i bordi sotto 1 px a 1 px pieno); lo splitter da 4 px non si muoveva. Risultato: l'editor saltava di
6 px all'ultimo frame. Nuova transizione `lib/motion.ts` → **`panelSlide`**: anima la larghezza totale con i
bordi laterali a 0 per tutta la durata (lo spazio passa nella larghezza), `flex-grow: 0` e `flex-basis: auto`
(un pannello che riempie, come il terminale con l'editor collassato, ignorerebbe la larghezza). La usano barra
laterale, pannello terminale, strisce, splitter (nuovo prop `motion`) e il riempitivo `.gap`: pannello e striscia
si scambiano in un movimento solo, 220 ms come in M56. Misurato: comprimendo la barra laterale il bordo
dell'editor passa da 268 a 26 px senza discontinuità e si ferma a ~207 ms (nessun salto finale); lo stesso
riaprendola e per il pannello terminale.

### Trascinamento delle chat: perché "spesso non funziona"
Riprodotto con eventi mouse veri: (a) trascinando la scheda della chat GIÀ visibile (senza split) l'unico
bersaglio è il suo stesso riquadro — il segno di rilascio compariva (metà destra evidenziata) ma al rilascio non
succedeva nulla (`id !== target`); (b) il bordo valeva solo entro il 25%: rilasciando "a destra" al 65-70% del
riquadro le chat si scambiavano invece di affiancarsi. La TUI di Claude non c'entra: col mouse-tracking attivo
(`enable-mouse-events`, sequenza iniettata in xterm) il trascinamento funzionava uguale. Correzioni (logica pura,
testata, in `terminalLayout.ts`): `dropZone` con soglia di un terzo; **split di sé** — la chat visibile trascinata
su un bordo del suo riquadro va da quel lato e dall'altro la scheda usata più di recente (`splitPartner` sulla
cronologia per repo `recentByRoot`); il segno compare solo se il rilascio farà qualcosa (al centro del proprio
riquadro, o col proprio riquadro già in uno split, nessun segno).

### "Reveal in Explorer"
`explorer /select,<path>` era passato con `Command::arg`: con uno spazio nel percorso (es. il repo
`Personal portfolio`) Rust quota l'intero argomento (`"/select,D:\…"`), explorer non lo riconosce e apre Documenti
senza selezionare nulla. Provato direttamente (Shell.Application per leggere cartella e selezione della finestra
aperta, poi chiusa): senza spazi funzionava, con lo spazio no, con `/select,"<path>"` sì. Ora
`raw_arg(explorer_select_arg(path))`: barre rovesciate, virgolette solo attorno al percorso, barra finale tolta
(unit test). Verificato nell'app: "cartella sparsa\appunti.txt" → Explorer su quella cartella, file selezionato.

### Simmetria delle icone
Misurata, non a occhio: uno script via CDP percorre ogni bottone con un'icona (e le righe con icona + testo) in
più stati — viste, Git con modifiche, chat affiancate, menu, Quick Open, impostazioni, strisce — e confronta i
margini dentro i bordi dopo l'allineamento ai pixel. Geometricamente era tutto centrato; il problema era il MEZZO
PIXEL: icone da 15 in bottoni da 26 (5,5 per lato), il "+" da 13 in 26×22, controlli finestra 44×29 (lì nessuna
icona quadrata può centrarsi in entrambi i versi). Chromium allinea la radice SVG ai pixel → margini 5 e 6 →
icona spostata di 1 px, ed è quello che si vedeva. I monitor dell'utente sono al 100% (DPR 1), quindi la regola è:
con sola icona `(larghezza − icona)` e `(altezza − icona)` pari; con icona + testo `(altezza − icona)` pari.
Interventi: top bar e testata Explorer a 14; "+" a 14; ✕ delle schede repo a 10; controlli finestra larghi 45 con
icone dispari; righe dell'albero e di Quick Open a 16; glifo delle schede editor 15 e ✕ 23×23 (centrata anche
nell'altezza DISPARI della scheda: `--h-tabs` pari meno 3 px di bordi); "tutte le schede" 13 e righe del menu alte
30; pannello terminale ("+", ✨) larghi 27 con icone da 13 e "scegli shell" 19; status bar con segmenti alti 21
(l'interno reale: con 22 sbordavano) e icone 13; Git: azioni dei file 14, Commit alto 32 (era 32,8). Da 37
elementi asimmetrici a 0 in entrambi gli assetti di misure (tema VS 2026 e quello degli altri temi). Resta
"Graph" nel pannello Git, di proposito: il padding 5/6 allinea il testo a Changes/History, che hanno la
sottolineatura da 2 px, e il bottone non ha fondo.

Secondo giro, estendendo il controllo alle viste e finestre che il primo non toccava (pannello Git con upstream,
diff, Git Graph, board Attività, risultati di ricerca, Docs con anteprima, benvenuto stretto e largo, dialoghi
prompt/scorciatoie/log/wrapper, notifiche, finestra flottante del terminale): altri 13 elementi. Finestra
flottante: i 4 bottoni 42×29 → 43 con icone dispari (pin 13, gli altri 15); Fetch/Pull/Push/Merge 15 → 14; lenti
Timeline/Chats della board 13 → 14; ✕ del visualizzatore di log 15 → 14; notifiche: riga di testo a 18 px (alte 36
invece di 36,8) e ✕ larga 25 (24 dentro il bordo). In tutto 49 elementi corretti (36 + 13); resta solo "Graph".

### Trovato e non corretto (fuori dal perimetro)
Lo stesso file aperto con separatori diversi diventa due documenti distinti (verificato: `\`, `/` e misti → 3
schede dello stesso file). Succede nei percorsi d'uso normali: Vai alla definizione (`joinPath(root, sym.file)`,
con `sym.file` relativo con `/`) e i link del terminale (`joinPath(cwd, p)` con `p` scritto da Claude) producono
`D:\…\Orbit\src/lib/x.ts`, diverso da `D:\…\Orbit\src\lib\x.ts` dell'albero. Con due copie aperte, salvarne una
sovrascrive le modifiche dell'altra. Da sistemare normalizzando i percorsi all'ingresso del workspace. → Corretto nella M59.

### Verifica
`svelte-check` 0/0 (261 file), vitest **25/25** (5 nuovi: `dropZone`, `splitPartner`), `cargo test` **34/34** (2
nuovi: `explorer_select_arg`, `project_root`). Build frontend OK: chunk d'avvio **542 KiB** (181 KiB gzip), +6 KiB
perché strisce e modalità leggera sono nel caricamento iniziale. Build release NON eseguito (nessun rilascio).
Collaudo nell'app reale via CDP su un'istanza dev **completamente isolata**: identifier
`com.visialab.lume.devtest` passato a compile time con `TAURI_CONFIG` (config dir e profilo WebView2 propri:
niente backup/ripristino della config dell'Orbit installato, a differenza di M53–M56) e `CARGO_TARGET_DIR`
separata. Coperti: drag (T1–T6, prima e dopo), compressione/riapertura con campionamento dei frame, modalità
leggera su una cartella con lo spazio nel nome (nessuna scrittura, nessuna registrazione né sessione, shell
normale riaprendo il pannello, Reveal, promozione) e su un file in una sottocartella di un repo (proposta la
radice del repo, niente scritto in `src/`), audit di simmetria nei due assetti.

Secondo giro di collaudo (l'utente chiedeva se tutto fosse stato provato; il primo giro non copriva questi casi):
- strisce: pallino git con modifiche presenti, pallino d'attesa dopo una bell a pannello compresso, clic su Git
  nella striscia (barra riaperta su quella vista), clic su una chat nella striscia (pannello riaperto su quella
  scheda, attesa spenta), Ctrl+B e Ctrl+` come tasti veri (CDP `Input.dispatchKeyEvent`);
- compressione col pannello a tutta larghezza (editor vuoto: l'editor va da 220 a 986 px, monotono) e col pannello
  massimizzato (l'editor ricompare da 0 a 986): un movimento solo, fermo a ~240 ms;
- modalità leggera: "Open folder" sulla cartella del file → promozione col file aperto; un'altra cartella → finestra
  normale, la cartella del file intatta; "chiudi tutte" con una finestra normale e una leggera aperte (due istanze
  isolate): nel registro c'era solo la normale, si chiudono entrambe e `windows-restore.json` contiene solo la
  normale; l'avvio nudo successivo riapre una sola finestra;
- schede aperte senza cartella: `term-1@null` passa alla prima cartella aperta e resta visibile;
- Reveal anche con virgola e lettere accentate nel percorso (`virgola, accentò\perché è.txt`) e su una cartella
  (apre la cartella superiore con quella selezionata).

Lezioni di collaudo:
- su questa macchina `src-tauri/target` era rimasto quello di quando il repo stava in
  `C:\Users\wcast\Desktop\Orbit`: i build script di tauri puntano a percorsi che non esistono più ("failed to read
  plugin permissions"); prima del prossimo `tauri dev` serve un `cargo clean`;
- dopo un aggiornamento a caldo Vite importa i moduli con `?t=…`: un `import('/src/…')` da CDP senza quella query
  crea una SECONDA istanza del modulo di stato, separata da quella dell'app → prendere l'URL dal resource timing;
- due modifiche ravvicinate allo stesso componente: il watcher di Vite ne ha persa una (CSS vecchio servito anche
  dopo il reload) → `touch` del file;
- un profilo di prova NUOVO ha "launch Claude in the default terminal" acceso: l'istanza isolata, aperta su una
  cartella, avvia un `claude` vero (fermo alla domanda di fiducia: niente token né trascrizioni, verificato) →
  spegnerlo o avviare "nudo"; e chiudere l'istanza col suo albero di processi (`Stop-Process` salta la chiusura
  ordinata dei PTY).

---

## Milestone 58 — chiudi tutte le schede, zoom delle immagini

Richieste dell'utente (2026-10-10), quattro punti: (1) la differenza fra l'installer di Orbit e quello di un altro suo progetto
("ha l'icona e sembra più bello"), (2) zoomare le immagini come il codice, (3) una funzione "close all tabs", (4)
pianificare le indicazioni che Visual Studio mette sopra metodi e classi (CodeLens). Qui (2) e (3); (1) e (4) sono
analisi in attesa di una scelta (in fondo). Branch `m58-close-all-image-zoom`, sopra `light-mode-strips`.

### Chiudere più schede (menu contestuale come in Visual Studio / VS Code)
- Prima c'erano solo la ✕ della singola scheda e il menu "tutte le schede"; nessun menu contestuale sulle schede.
- Tasto destro su una scheda: **Close**, **Close others**, **Close to the right**, **Close saved**, **Close all**
  (con l'editor diviso anche *Close all in this group*: "Close all" chiude tutto, l'altra solo il riquadro della
  scheda), poi *Copy path*, *Copy relative path* e *Reveal in Explorer* per i documenti su disco (non diff, Attività,
  grafo), con le stesse funzioni dell'albero (`copyRelPath` e `revealPath` spostate da `Explorer.svelte` a
  `explorer.svelte.ts`). Le voci che non si applicano sono spente, non nascoste: il menu ha sempre la stessa forma
  (`MenuItem.disabled`, nuovo in `ContextMenu`).
- *Close all* anche in fondo al menu "tutte le schede", fuori dalla lista che scorre.
- `workspace.closeTabs(groupId, paths)` chiude più schede di un gruppo con una sola potatura del pool; la nuova
  scheda attiva segue la regola di `closeTab` (la prima rimasta a destra, poi a sinistra), estratta nella funzione
  pura `editorTabs.nextActive` e coperta da vitest.
- Modifiche non salvate: ogni chiusura passa da `requestClose(targets)`, che chiede **una volta sola** per tutti i
  documenti modificati che sparirebbero del tutto (uno aperto anche in un altro riquadro non si perde, e non si
  chiede). Il dialog ha *Save all / Don't save / Cancel* e l'elenco dei file (glifo, nome e cartella in grigio, per
  distinguere gli omonimi; oltre sei, "and N more"). *Save all* chiude solo ciò che si è salvato: un salvataggio
  fallito lascia aperta la sua scheda, con l'errore.
- Nessuna scorciatoia: quella nota è un accordo (Ctrl+K Ctrl+W di VS Code, e Ctrl+K in Orbit apre una cartella), e
  Visual Studio e IntelliJ non ne hanno una predefinita.

### Zoom delle immagini, come il codice
- Prima: `<img>` con `max-width/max-height: 100%`, e Ctrl+rotella cambiava il font dell'editor anche sopra
  un'immagine (il gestore globale di `App.svelte`, in cattura).
- Ora l'immagine si dimensiona in JS su un "palco" (adatta = `min(1, vista / misura naturale)`, come prima: le
  piccole restano al 100%), a posizioni intere, così al 100% è nitida.
- **Ctrl+rotella**: livelli tondi dal 5% al 3200% con "adatta" in mezzo, ancorati al cursore (il pixel sotto il
  puntatore resta lì, `flushSync` prima di riposizionare lo scorrimento). I delta si sommano: un pinch del
  touchpad scatta come una tacca. Il gestore globale salta `.imgview`.
- **Doppio clic**, o la percentuale nell'angolo accanto alle misure: adatta ⇄ 100% (200% se è già al 100%).
- Ingrandita si sposta **trascinandola** (cursore a mano) o con la rotella; niente barre di scorrimento: comparendo
  e sparendo spostavano l'immagine di mezza barra a ogni scatto.
- Da 300% `image-rendering: pixelated` (come VS Code): i pixel restano netti.
- Zoom e posizione restano per immagine finché Orbit è aperto (la vista si rimonta a ogni cambio di scheda).
- La scacchiera della trasparenza sta solo dietro l'immagine e si sposta con lei (prima riempiva la vista).
- File illeggibile: "This image can't be displayed" invece dell'icona rotta.

### Verifica
`svelte-check` 0/0 (263 file), vitest **30/30** (5 nuovi, `nextActive`). Build frontend OK: chunk d'avvio **546 KiB**
(182 KiB gzip; +4 KiB per menu e dialog dell'editor); il visualizzatore resta un chunk a parte (4 KiB di JS e 2 di
CSS). Backend non toccato. Build release non eseguito.
Collaudo con clic, tasto destro, doppio clic, trascinamenti e rotella veri (CDP) nell'istanza isolata `devtest`:
- schede: *Close to the right* (attiva fra le chiuse → diventa attiva quella cliccata), voce spenta sull'ultima
  scheda, *Close saved*, *Close all* con due file modificati (*Cancel* non chiude nulla; *Don't save* chiude tutto e
  il disco resta com'era; *Save all* con un file in sola lettura: l'altro si salva e si chiude, quello resta aperto
  con "Accesso negato"), editor diviso con lo stesso file modificato nei due riquadri (*Close all in this group*
  senza domande, il documento resta nell'altro), menu sulla scheda Attività (senza voci di percorso), Esc, dialog
  con 8 file;
- immagini: 2400×1600 adattata al 22%; sei tacche → 25, 33, 50, 67, 75, 100% con il pixel sotto il cursore fermo
  (±1 px) da quando l'immagine esce dalla vista (prima è centrata, e cresce dal centro); ritorno ad "adatta" e sotto
  (20%); in "adatta" segue la vista (barra laterale compressa: dal 22 al 32%); doppio clic → 100% ancorato
  (pixel 521,267 contro 520,8,267,2) e ritorno; trascinamento di 100 px → 100 px di scorrimento; clic sulla
  percentuale; rotella semplice che scorre; memoria al cambio di scheda; 48×32 → 200% → pixelated da 300% → fermo a
  3200%; PNG trasparente; SVG con misure; SVG con il solo viewBox (WebView2 dà 50×150 per un 1:3, senza
  deformare); file rotto; Ctrl+rotella su editor e terminale cambia ancora i loro font, sopra l'immagine no;
- simmetria: glifo di *Close all* 8/8 px nel suo riquadro, glifi del dialog 4/4, percentuale 2/2.

Bug trovato in collaudo e corretto: il *Close all* del menu "tutte le schede" non faceva nulla. `grp` è un
`{@const}` che dipende da `tabMenu`: azzerato il menu, rileggerlo lanciava un errore. Ora le schede si leggono prima
di chiudere il menu, come già facevano le righe della lista.

Lezione di collaudo: dopo l'aggiornamento a caldo di un modulo di stato (`workspace.svelte.ts`) l'interfaccia
restava legata all'istanza vecchia e il CDP scriveva in quella nuova (zero schede a video, quattro nello stato) →
ricaricare la pagina prima di continuare.

### In sospeso: installer e "CodeLens" (analisi per la scelta dell'utente)
- **Installer**: Orbit usa l'NSIS di Tauri senza `installerIcon`, `headerImage` né `sidebarImage`, quindi `setup.exe`
  e `uninstall.exe` hanno l'icona generica di NSIS (estratta e verificata) e la procedura guidata classica. L'altro
  progetto usa Velopack (`vpk pack --icon …`): un clic, icona dell'app, installazione per l'utente in `%LOCALAPPDATA%`,
  aggiornamenti delta. Opzioni proposte: icona e immagini NSIS (il minimo), Velopack come l'altro progetto (vanno rifatte le
  associazioni dei file e la migrazione dall'installazione NSIS), un template NSIS proprio (sconsigliato).
- **CodeLens**: sondaggio sui due repo, in sola lettura dalla rubrica `.orbit/index/symbols.json`. Contare i
  riferimenti per nome su tutto il progetto, saltando commenti e stringhe, costa 23 ms su Orbit (97 file, 921
  simboli) e 34 ms su un progetto C# privato (203 file, 2008 simboli), in Node. Il nome è unico per l'80% dei simboli di Orbit e il
  60% di quelli del progetto C# (overload, `Dispose`, proprietà omonime). `git blame` sui file più grandi: 60–80 ms. Il
  limite non è il costo ma la precisione sui nomi condivisi.
- **Difetto dello scanner C# trovato nel sondaggio** (non corretto, in attesa): `cs()` accetta una riga come
  dichiarazione di metodo se contiene una QUALSIASI parola di `CS_MODS`, e fra queste c'è `new` → `var m = new
  Metadata();` diventa il "metodo" `Metadata`. Sul progetto C# 416 "metodi" C# su 1.649 sono chiamate o
  `new X()` (su Orbit, TS/Svelte/Rust, nessuno). Effetti già oggi: F12 su una classe molto istanziata apre una lista di 38
  "definizioni" invece di saltare alla classe, rumore in Ctrl+T e nella barra dei correlati. Correzione proposta:
  modificatori solo PRIMA del nome, e nome non preceduto da `new`, `.`, `=`, `return`, `await`.
  → Corretto nella M59.

---

## Milestone 59 — aggiornamenti da GitHub, nessuna modifica persa alla chiusura, bug noti

Richieste dell'utente (2026-10-10): (1) quando esce una release su GitHub, Orbit lo deve segnalare e aggiornarsi
senza riscaricare a mano; (2) "se ci sono bug aperti che conosci risolvi e testa"; (3) CodeLens se ne discute
dopo aver chiuso i punti in sospeso. Branch `m59-updates-and-fixes`, sopra `m58-close-all-image-zoom`.

### Aggiornamenti da GitHub
- **Scelta**: il plugin ufficiale `tauri-plugin-updater` sull'installer NSIS che c'è già, invece di Velopack
  (l'opzione B della M58). Dà la stessa cosa — avviso e aggiornamento sul posto — senza migrare
  l'installazione, senza riscrivere le associazioni "Apri con" e l'hook NSIS. La procedura guidata si vede
  solo alla prima installazione: gli aggiornamenti sono passivi (solo la barra di avanzamento). Il repo è
  pubblico: `latest.json` si legge dalla release "latest" senza token.
- **Comandi Rust** (`updater.rs`, niente pacchetto npm né permessi sul plugin): `update_check`,
  `update_download` (avanzamento con `update-progress`), `update_install` (firma minisign verificata con la
  chiave pubblica di `tauri.conf.json`, poi l'installer NSIS passivo `/P /UPDATE /R /ARGS …`).
- **Interfaccia** (`updater.svelte.ts`, `UpdateDialog.svelte`): controllo ~30 s dopo l'avvio e ogni 6 ore
  (mai nei build di sviluppo; spegnibile in Impostazioni, dove ci sono anche la versione installata e *Check
  now*); con una versione nuova un avviso cliccabile una volta per versione e la pillola **Update** in alto
  (stile della pillola "Waiting", ferma); il dialog mostra le note della release in Markdown (link aperti nel
  browser), cosa succede al riavvio (finestre e schede tornano; terminali e chat di Claude ripartono, le chat
  si riprendono da Attività), poi avanzamento, attesa delle altre finestre, installazione, errori con *Retry*.
- **Finestre**: prima di installare `prepareQuit` (sotto) in questa finestra; `quit_others` fotografa TUTTE
  le finestre per il ripristino e chiede alle altre di uscire (stesso segnale del "chiudi tutte", baseline
  propria spostata prima); il frontend aspetta con `other_instances` — su Windows i processi dello STESSO
  eseguibile, finestre leggere comprese (quello che l'installer deve sostituire). Il plugin su Windows esce
  con `std::process::exit` dopo aver avviato l'installer, saltando `ExitRequested`: il suo `on_before_exit`
  chiude i PTY e toglie la finestra dal registro. Un segno (`update-restart.json`, valido 10 minuti) fa sì
  che il processo rilanciato dall'installer — con gli argomenti della finestra che ha aggiornato — ignori gli
  argomenti e riapra tutte le finestre; `startup()` restituisce `updatedTo` per l'avviso "aggiornato".
- **Firma**: chiave privata in `~/.tauri/orbit-updater.key` (stessa convenzione delle chiavi già presenti lì,
  senza password; va conservata: senza, gli Orbit installati non accettano versioni nuove), la pubblica in
  `tauri.conf.json`. Gli artefatti firmati li produce solo lo script di rilascio (`--config` con
  `createUpdaterArtifacts`): in `tauri.conf.json` un `npm run tauri build` senza chiave fallirebbe.
- **`scripts/New-Release.ps1`** (sul modello dello script di rilascio dell'altro progetto): versione uguale nei sei punti
  (il lockfile era rimasto indietro per cinque release), build firmata, `latest.json` con NSIS (`windows-x86_64`
  e `-nsis`) e MSI (`-msi`), artefatti in `artifacts/release` (ignorata da git), con `-Publish` la release su
  GitHub dal commit già pushato. Rispetta `CARGO_TARGET_DIR`.
- **Installer**: `installerIcon` → `setup.exe` e `uninstall.exe` con l'icona di Orbit (era quella generica di
  NSIS; verificato estraendo l'icona dal setup nuovo).
- **Dipendenze** (gate "deps al minimo"): `tauri-plugin-updater` 2.12.0 (la 2.13 vuole un Tauri più nuovo)
  senza default-features: `native-tls` invece di rustls (SChannel su Windows: più leggero e accetta i
  certificati dei proxy aziendali che Windows accetta) + `system-proxy`; `zip` (tar/flate2) solo fuori da
  Windows, dove l'aggiornamento è un archivio. `windows-sys` già presente: aggiunta la feature ToolHelp.
  **Peso** (gate #1), build release vera dello script contro la v0.9.1 pubblicata: eseguibile 5,74 → 6,42 MiB
  (+0,67, quasi tutto il client HTTPS), setup NSIS 2,85 → 3,11 MiB, MSI 3,51 → 3,84 MiB.
- **Da sapere**: la v0.9.1 installata non ha l'aggiornamento automatico → la prima versione che lo contiene va
  installata a mano, le successive arrivano da sole. Una release senza `latest.json`, o marcata pre-release,
  non viene proposta.

### Bug noti risolti (e testati)
1. **Chiusura che perdeva le modifiche** (trovato studiando l'aggiornamento): la ✕, `Alt+F4` e "chiudi tutte"
   chiudevano senza chiedere — con l'autosave acceso si perdeva quanto scritto dopo l'ultimo salvataggio
   automatico, spento tutto; le altre finestre del "chiudi tutte" uscivano con `app.exit`. Ora
   `onCloseRequested` → `prepareQuit` (autosave se acceso, poi *Save all / Don't save / Cancel*, poi la
   sessione scritta subito: l'autosave della sessione è differito di 400 ms). Lato Rust la chiusura è in due
   fasi: `CloseRequested` salva solo la geometria, l'uscita dal registro avviene a `Destroyed` — altrimenti,
   annullando, la finestra restava aperta ma fuori dal registro (e un avvio nudo l'avrebbe duplicata). Il
   "chiudi tutte" chiede a ogni finestra (`orbit-quit-request` → `prepareQuit` → `quit_now`); chi annulla resta
   aperta e il watcher resta in ascolto. Un solo dialog per tutta l'app (`unsaved.svelte.ts` +
   `UnsavedDialog.svelte`), usato anche da schede, cambio cartella e "Open as project" (lì prima c'era un
   confirm nativo a due pulsanti che poteva solo scartare).
2. **Lo stesso file come due documenti** (M57, "Trovato e non corretto"): i percorsi entrano nel workspace in
   forma canonica (`util.canonPath`, `\` su Windows) e si confrontano con `samePath`/`pathKey` (separatori e,
   su Windows, maiuscole indifferenti); le sessioni salvate con le due forme si fondono al ripristino. Anche
   l'evidenziazione del file attivo in Explorer/MiniTree/Docs e la cronologia di navigazione.
3. **Attività bloccava l'interfaccia**: `scan_activity` era un comando sincrono (thread principale) che a OGNI
   modifica di un transcript rileggeva tutti i transcript — 26 file, 206 MiB su questo PC. Ora è async su un
   thread bloccante con una cache per transcript (data di modifica + dimensione): in release la scansione
   completa costa 469 ms, quella con la cache 2,5 ms più la rilettura del solo transcript cambiato.
4. **Scanner C#** (in sospeso dalla M58): il modificatore va cercato solo PRIMA del nome, e davanti al nome non
   ci devono essere espressioni (`=`, stringhe, `.`, parentesi aperte, `new`/`return`/`await`…). In più:
   attributi/annotazioni a inizio riga saltati, metodi generici (`Load<T>(…)`, prima mai indicizzati),
   proprietà `Nome => …` (prima finiva nell'indice il metodo CHIAMATO a destra).
5. **Decorazioni git in una sottocartella** ("limite noto" dalla M12): `git_status` restituisce anche la radice
   del repo (`workdir`); albero e margine dell'editor la usano (`repoBase` la ricava dalla cartella aperta,
   così maiuscole e separatori restano quelli dell'albero; `gitRel` per `git_diff`).
6. **Scheda attiva fuori vista** (visto nel collaudo M58): la barra scorre (solo lei, con lo scorrimento morbido
   se il movimento è acceso) finché la scheda attiva è visibile.
7. **Menu contestuale fuori dallo schermo** vicino al bordo: l'altezza era stimata (5 px per separatore invece
   di 9, niente etichette su due righe); ora è misurata.
8. `app_version` dava la versione di Cargo e non quella della configurazione Tauri che usa l'aggiornamento
   (coincidono nei rilasci, non in una build con `--config`): ora `package_info().version`.

### Verifica
`svelte-check` 0/0 (268 file), vitest **34/34** (4 nuovi: percorsi canonici), `cargo test` **36/36** (2 nuovi:
chiamate C# non più dichiarazioni, dichiarazioni ancora trovate) + 1 misura ignorata (`scan_timing`, a mano in
release). Collaudo nell'istanza di sviluppo isolata (CDP, clic e tasti veri):
- percorsi: quattro forme dello stesso file (`\`, miste, `/`, minuscole) → un documento e una scheda; Vai alla
  definizione sulla stessa scheda; la modifica si vede da tutte le forme; sessione con due forme → una scheda;
- chiusura: ✕ vera con un file non salvato e autosave spento → dialog; *Cancel* → finestra aperta, processo vivo,
  voce nel registro; ✕ + *Save* → file scritto, processo uscito, registro vuoto, la finestra nel set da riaprire;
- "chiudi tutte" con due processi: A esce, B chiede per `notes.md`, *Save* → salvato e uscito; il set da riaprire
  ha entrambe e un avvio nudo le riapre con le loro schede;
- git in sottocartella: finestra su `docs` → "notes.md M" nell'albero e 2 segni nel margine;
- schede: 8 aperture → l'ultima visibile (barra scorsa di 458 px), la prima dal menu → di nuovo a 0;
- menu: 5 voci e 2 separatori aperto a 140 px dal fondo → tutto dentro, a 6 px dal bordo;
- Attività: durante la prima scansione (2,2 s nel build di debug) un altro comando risponde in 2 ms;
- scanner sul codice vero del progetto C# (`scan_symbols` in sola lettura): metodi 1.659 → 1.237; i 436 tolti erano tutti
  chiamate (417 per regola, 19 visti a mano: chiamate o metodi chiamati dentro proprietà `=>`);
  la classe di prima da 39 definizioni a 1; 13 metodi generici nuovi.

**Aggiornamento da capo a fondo**, con un prodotto di prova separato da Orbit (`OrbitUpdTest`: eseguibile
`orbit-updtest.exe` — l'installer NSIS chiude i processi per NOME, quindi non poteva toccare l'Orbit vero —,
identificativo proprio, niente associazioni né hook, chiave di prova, un server locale al posto di GitHub):
0.9.90 installata in silenzio; finestra A sul repo di prova e B sulla sottocartella `docs` (due processi);
modifiche non salvate scritte davvero in entrambe, autosave spento. Il controllo automatico è partito da solo
dopo 30 s → pillola e avviso; dialog con le note; *Update and restart* → download di 3,1 MB → A chiede
(*Discard and update* / *Save*) → *Save* → "Closing the other Orbit windows (1 left)" → B chiede → *Save* → B
esce → installer passivo → in circa 2 secondi entrambe le finestre riaperte sulla 0.9.91 con le loro schede, i
due file salvati su disco, l'avviso "Orbit updated to 0.9.91" una volta sola; i controlli successivi non trovano
nulla. Disinstallazione pulita (cartella, voce di disinstallazione, collegamenti); restava
`HKCU\Software\visialab\OrbitUpdTest`, che il disinstallatore di Tauri lascia apposta, tolta a mano.
**Script di rilascio** provato senza `-Publish` (build release firmata con la chiave vera, `latest.json` con
indirizzi e firme giusti); gli artefatti, di una 0.9.1 mai pubblicata, cancellati. Nessuna release pubblicata.

Lezioni di collaudo:
- il `localStorage` di WebView2 arriva su disco in modo differito: chiudendo il processo con `Stop-Process`
  subito dopo averlo scritto si perde. Per preparare un profilo di prova si chiude la finestra normalmente;
  altrimenti la prima apertura di una cartella avvia un `claude` vero (rimasto alla domanda di fiducia:
  nessun transcript, `~/.claude.json` intatto, verificato, processi chiusi);
- in un build release i moduli sono in un bundle: niente import dal CDP, si pilota l'app come un utente (clic,
  `Input.insertText` nell'editor, IPC per i comandi) e le impostazioni si preparano nel `localStorage`;
- lo strumento PowerShell rifiuta `Remove-Item` con percorsi costruiti da variabili: percorsi espliciti, o `rm`
  dalla bash dopo aver controllato il percorso.

---

## Milestone 60 — CodeLens, "Apri con" senza predefinito, rifiniture per la 1.0

Richiesta dell'utente (2026-10-10), dopo il merge e il push della M59: "prima di fare una nuova release
discutiamo di codelens e chiudiamo tutti i punti aperti? poi alla fine rilascerei 1.0.0". Scelte: la lente
**sopra la dichiarazione** (come Visual Studio), con **riferimenti e implementazioni** (niente informazioni
git), il clic apre l'**elenco nella palette**; da chiudere prima della 1.0: associazioni solo "Apri con",
screenshot del README nuovi, pulizia prima del rilascio. Branch `m60-codelens-associations`.

### CodeLens
- **Cosa conta.** Niente language server (gate #1): i riferimenti si contano **per nome**, nello stesso giro
  della scansione dei simboli. `refs.rs` legge ogni file con un lexer per famiglia di linguaggi (C-like, C#,
  JS/TS/Svelte, Go, Python, markup XAML/Razor): salta commenti e stringhe ma legge le interpolazioni
  (`$"{x}"`, `` `${x}` ``, f-string), riconosce i lifetime di Rust, le raw string, i prefissi di Python, i
  numeri. Conta le **righe** che contengono il nome, non le occorrenze: così il numero sulla lente è uguale alle
  righe dell'elenco (prima prova: 13 lenti su 13 coerenti solo dopo questo cambio). La scansione tiene solo i
  nomi che sono simboli; `codeIndex` li salva in `.orbit/index/refs.json` accanto a `symbols.json`.
- **Cosa mostra.** "N references" = righe col nome − dichiarazioni − costruttori; **≈** davanti quando il nome
  è dichiarato più volte (il conto per nome mescola omonimi). Niente lente sui costruttori e sui metodi
  speciali di Python. Sui tipi anche "N implementations" (gli implementatori già noti alla barra dei
  correlati). Impostazione *Code lens*, accesa di default.
- **Il clic.** *N references* chiama `ref_list(root, name)` (async su un thread bloccante: le righe che
  contengono il nome, file ≤ 2 MB con prefiltro sul testo, al massimo 2000) e apre la palette di `Ctrl+T` con
  file e testo della riga (tipo `ref`), le dichiarazioni escluse; Invio salta lì e la cronologia avanti/indietro
  funziona come per Vai alla definizione. *N implementations* riusa `showImplementers`.
- **Editor** (`editor/codeLens.ts`): widget di blocco di uno `StateField`, mappati sulle modifiche (le lenti
  seguono il testo mentre scrivi, si ricalcolano al salvataggio); rientro uguale a quello della riga
  (padding di `.cm-line` + rientro × `defaultCharacterWidth`: senza il padding erano 6 px a sinistra);
  testo all'85% della dimensione dell'editor; l'azione su `click` (il `mousedown` viene inghiottito, sennò il
  cursore saltava sulla riga della lente).
- **Fuori dal thread principale**: `scan_symbols`, `ref_list` (e già `scan_activity`) sono comandi async — un
  comando Tauri sincrono gira sul thread principale e blocca la finestra.
- **Peso** (gate #1): nessuna dipendenza nuova. In release, scansione + conteggi: Orbit 14,3 ms (1.049 simboli,
  931 nomi), un progetto C# 21,7 ms (1.780 simboli, 1.457 nomi) — `symbols::tests::scan_timing`, ignorato, a mano.

### Scanner TS/JS
Le lenti hanno mostrato simboli che non lo erano:
- `const all = (refs[name] ?? 0) - decls` era una funzione (bastava una parentesi in testa);
- `const t = terminals.list.find((s) => s.id === id)`: bastava un `=>` sulla riga → una "funzione `t`" con una
  lente da 100+ riferimenti (`left`, `right`, `next`… in `terminalLayout.ts`). Ora è una funzione solo se il
  valore È una funzione: `function`, `async …`, `(…) =>`/`(…): T =>` (parentesi bilanciate, o ancora aperte a
  fine riga = parametri su più righe), `<T,>(…) =>`, `x =>`;
- le funzioni dentro altre funzioni sono aiutanti locali e restano fuori dalla rubrica: più rientrate del livello
  esterno (0, o il rientro dello `<script>` in un componente Svelte).
Sull'indice di Orbit: 1.072 → 953 simboli; i 119 tolti erano valori (`ALL_THEME_VARS`, `lastRev`, `off`…) o
aiutanti annidati (`mayQuit`, `tick`, `canon`…), nessuna funzione di primo livello.

### Bug del fuoco (preesistente, trovato col clic sulle lenti)
La palette aperta da una lente non prendeva il fuoco, e lo stesso valeva per `Ctrl+P` premuto con l'editor
attivo: **i tasti finivano nel file**. Causa: Svelte 5 applica `autofocus` solo se il fuoco è sul `body`
(`svelte/src/internal/client/dom/elements/misc.js`). Nuova azione `focusOnMount` (`lib/focus.ts`) al posto di
`autofocus` in QuickOpen, SymbolPalette, WorkspaceSymbols, WrapperComposer, UnsavedDialog, UpdateDialog,
StatusBar e nei due campi di rinomina dei terminali (che con `{ select: true }` ora selezionano il nome:
riselezione al frame dopo, perché xterm riprendeva la selezione).

### "Apri con" senza diventare il programma predefinito
- **Il problema**: `bundle.fileAssociations` fa scrivere all'installer NSIS di Tauri `APP_ASSOCIATE`, che non
  aggiunge Orbit ad "Apri con": lo rende il **predefinito** dell'estensione (`HKCU\Software\Classes\.ext` =
  `Orbit document`, il valore precedente in `Orbit document_backup`). Sul PC dell'utente (letto, non toccato):
  12 estensioni (`txt md json py js ts cs html png pdf svelte log`) avevano Orbit come predefinito con backup
  vuoto; dove c'è una `UserChoice` (6 di queste) vince quella.
- **La soluzione**: `tauri.windows.conf.json` toglie `fileAssociations` solo su Windows (merge patch JSON;
  macOS e Linux lo usano ancora) e `windows/hooks.nsh` fa la registrazione: il ProgID `Orbit document` (stesso
  nome, così le scelte "usa sempre Orbit" già fatte continuano a funzionare) con icona e comando, e il ProgID
  nelle `OpenWithProgids` di ogni estensione. Dove il predefinito è ancora quello messo da un Orbit precedente
  lo restituisce: il backup, se c'era, altrimenti nessuno — togliendo anche il valore VUOTO che il vecchio
  disinstallatore lascia (riscrive il backup invece di cancellare), perché un predefinito vuoto in HKCU
  nasconde quello di sistema. Le `UserChoice` non si toccano; gli script (`bat cmd ps1 sh bash`, tolti dalla
  v0.8.10) hanno solo la pulizia. La disinstallazione toglie le voci e il ProgID.
- **Prova** (banco `makensis` con l'`hooks.nsh` vero, ProgID `OrbitTest document` ed estensioni finte
  `.orbt1-5`, quindi nessuna estensione vera del PC toccata): predefinito nostro con backup vuoto → tolto;
  con backup → restituito; vuoto lasciato dal disinstallatore → tolto; di un altro programma → intatto; chiave
  assente → solo "Apri con". Dopo la disinstallazione niente voci, niente chiavi vuote, niente ProgID.
- **Solo NSIS**: gli hook valgono per il setup; l'**MSI** (WiX), che prima rendeva Orbit predefinito come
  l'NSIS, ora non registra nessun "Apri con". Il setup è l'installer consigliato (README, note di rilascio);
  per l'MSI servirebbe un frammento WiX con `OpenWithProgids`.

### Attività (difetti trovati preparando gli screenshot)
- Etichetta "ode-strips": il messaggio di commit si cercava come il primo `-m` del comando, anche dentro
  `git merge light-mode-strips && git commit …`. Ora solo i flag dopo `git commit`, a parola intera; letti anche
  `-am`, `--message=`, `-F -` con un heredoc e la here-string di PowerShell (`-m @'…'@`); `\"` dentro le
  virgolette. `git commit` dentro una stringa (`echo "git commit"`) non è più un commit.
- "(senza titolo)" su metà delle unità: un'unità senza un prompt suo (lavoro proseguito dopo un cambio di
  branch o un commit, nello stesso turno) prende ora la richiesta da cui viene, con **↳**; il ripiego finale è
  "(untitled)". Le unità committate senza hash nell'output (`git commit -q`) risultavano "uncommitted" e non
  contavano tra i commit delle chat; il dettaglio non mostra più "0 steps" per le unità di seguito.
- Intestazione: a pannello stretto Timeline/Chats (gruppo con `overflow: hidden`) si restringevano fino a "Ch";
  ora si accorcia prima il riepilogo (coi puntini, testo intero nel tooltip), poi il filtro.
- La cache delle unità è solo in memoria: con un Orbit nuovo le etichette si ricalcolano tutte.

### Interfaccia in inglese
Gli ultimi testi italiani dell'interfaccia: i tempi relativi ("5 min fa" → "5 min ago", date en-GB) in Attività e
nella cronologia Git, "Testo" → "Plain Text" nella barra di stato, il compositore dei wrapper (segnaposto,
anteprima, bottoni, avvisi), le regole dello scaffale, il toast "No folder open", i diff senza differenze, un
errore di configurazione. Le scorciatoie predefinite di Claude e la sezione generata del CLAUDE.md restano in
italiano: sono contenuto, non interfaccia.

### Screenshot del README
Rifatti tutti e tre con l'interfaccia attuale (barra repo centrata, strisce, CodeLens, Attività corretta), stessa
inquadratura di prima: finestra 2000×1125 catturata a 2600×1463. Con il CDP:
`Page.captureScreenshot` con `clip.scale: 1.3` ridisegna il testo alla risoluzione maggiore senza cambiare
`devicePixelRatio`; `Emulation.setDeviceMetricsOverride` invece lo cambia, xterm fa le righe più alte senza
rifittare e l'ultima riga delle chat usciva dal riquadro. Le chat sono `claude` veri nell'istanza di prova, che
eredita `CLAUDE_CODE_CHILD_SESSION`: niente transcript (lo dice la riga "Transcript saving is off"). In
Attività compare solo Orbit: gli altri progetti dell'utente (un repo privato, progetti di lavoro) sono tolti
dalla lista nel profilo dell'istanza di prova, non in quello vero — un README pubblico non li deve mostrare.

### Verifica
`svelte-check` 0/0 (270 file), vitest **36/36** (2 nuovi: testi in inglese), `cargo test` **48/48** (12 nuovi:
7 del lexer dei riferimenti — commenti, stringhe e interpolazioni per C#, JS, Rust, Python, Go e markup, numeri,
righe invece di occorrenze —, 3 dello scanner TS, 2 di Attività) + 2 misure ignorate. Collaudo nell'istanza
isolata (CDP, clic veri) su una copia di un progetto C# privato e una del codice di Orbit:
- lenti sopra le dichiarazioni allineate al testo (335,2 px entrambe); *4 references* su un'interfaccia
  → palette con 4 righe, dichiarazione esclusa, Invio alla riga 45, Indietro torna; *2 implementations* → 2;
- digitando sopra una dichiarazione la lente la segue; il toggle le spegne e le riaccende; le palette prendono
  il fuoco anche dall'editor (prima i tasti finivano nel file);
- Attività sui transcript veri: etichette dai commit (anche `-F -`), seguiti con ↳, "Timeline" e "Chats" interi
  a 660 px di editor, "now"/"committed" nel dettaglio.

**Versione 1.0.0.** Prima del build la pulizia scelta dall'utente: `cargo clean` del vecchio `src-tauri/target`
(14,6 GiB), via lo stash col rumore di npm 11 (`"peer": true` nel lockfile) e i branch locali già fusi in `main`.
Build con `scripts/New-Release.ps1` (senza `-Publish`): eseguibile **6,46 MiB** (+0,04 sulla M59), setup NSIS
**3,13 MiB**, MSI **3,86 MiB**, chunk iniziale 553 KiB (185 KiB gzip). Nello script NSIS generato nessun
`APP_ASSOCIATE`/`APP_UNASSOCIATE`, `hooks.nsh` incluso e i due hook inseriti; nel `main.wxs` dell'MSI nessun
`ProgId`; `latest.json` punta agli asset della v1.0.0.

**Chiave di firma con password** (scelta dell'utente prima di pubblicare): la chiave della M59, senza password,
non era mai uscita (nessuna release pubblicata con la sua chiave pubblica), quindi la 1.0.0 nasce con una chiave
nuova protetta da password, generata dall'utente nel suo terminale (la password non passa da qui); la vecchia è
messa da parte in `~/.tauri/orbit-updater-nopass.key`. `New-Release.ps1` chiede la password senza mostrarla (o
la legge da `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), la toglie dall'ambiente alla fine e la prova firmando un file
di prova prima di compilare: provato con la vecchia chiave, password vuota → firma, password sbagliata → errore.

**Rilasciato in v1.0.0** il 2026-10-10: "Orbit v1.0.0 — CodeLens and updates from GitHub", tag `v1.0.0` sul
commit `1db093a`, pubblicata dall'utente nel suo terminale con `New-Release.ps1 -Publish` (setup, MSI, le due
firme e `latest.json`). È la prima versione con l'aggiornamento automatico: dalla 0.9.1 si installa a mano, le
successive arrivano da sole. Dopo l'installazione la chiave vecchia (`orbit-updater-nopass.key`) si può cancellare.

Lezioni di collaudo:
- Svelte 5: `autofocus` non è una garanzia; per i campi che devono avere il fuoco, `use:focusOnMount`;
- quando Vite ricarica la pagina intera (modifica a un modulo condiviso) la lista dei terminali riparte da zero
  ma i PTY restano vivi nel backend: si chiudono con `pty_kill` (gli id ripartono da `term-1`);
- Python su Windows scrive `\r\n` in modalità testo: per i file del repo `newline=""` (il `.gitattributes` con
  `eol=lf` normalizza il commit, non la copia di lavoro);
- in PowerShell i nomi delle variabili non distinguono le maiuscole: `$h` (l'handle) sovrascriveva il parametro
  `$H` (l'altezza) → finestra alta 32.767 px.

### Riservatezza (il repo è pubblico)
Su richiesta dell'utente, a fine lavoro: i commit pubblicati in questa sessione sono stati controllati (nessuna
chiave privata, password, token, email o percorso personale; nessun file sensibile tracciato) e dal testo attuale
sono stati tolti i riferimenti a cose private finite nelle note: il nome dell'altro progetto dell'utente (privato)
con nomi e righe del suo codice in un test dello scanner C#, e un documento di lavoro usato in un collaudo della
M52. Restano nella storia dei commit già pubblicati (toglierli vorrebbe dire riscriverla e forzare il push di
`main` e del tag della release). **Regola**: nelle note, nei test e negli screenshot solo Orbit e dati finti —
niente nomi di progetti privati o di lavoro, documenti, percorsi personali, segreti.

### Punti aperti dopo la 1.0
- L'MSI non registra "Apri con" (servirebbe un frammento WiX con `OpenWithProgids`); il setup NSIS è quello
  consigliato.
- Le scorciatoie predefinite di Claude sono in italiano: è contenuto, non interfaccia, ma per utenti non italiani
  andrebbero in inglese.
- Idee rimandate nella discussione della 1.0: parentesi colorate, segni nella barra di scorrimento, effetto Mica.
- La notifica a campanella di Claude funziona nell'uso (confermato dall'utente): punto chiuso.

---

## Milestone 61 — versione e aggiornamenti sempre in vista nelle Impostazioni

Domanda dell'utente dopo la 1.0: «nell'app non c'è un modo per vedere la versione e controllare se ci sono
aggiornamenti?». C'era già dalla M59, ma era l'**ultima** delle 18 righe delle Impostazioni. La lista è alta
circa 1.200 px e in una finestra di 720 px se ne vedono meno di 500: senza scorrere fino in fondo non la si
trovava.

- La riga *Orbit 1.0.0* con **Check now** (o **Update…** quando c'è una versione nuova) è diventata il **piè**
  del pannello, fuori dalla lista che scorre. Il pannello è una colonna flex con
  `max-height: calc(100vh - 110px)`, come ShortcutsDialog; scorre solo `.body` (`min-height: 0`), mentre testata
  e piè restano fermi.
- Allineamento: la lista riserva lo spazio della scrollbar (`scrollbar-gutter: stable`, 12 px in `app.css`) e il
  piè ha 26 px a destra (14 + 12), così il pulsante cade a filo dei controlli delle righe. Misurato: 27 px dal
  bordo del pannello, come tutti i 17 controlli della lista; etichette a 15 px.
- Testi e comportamento sono invariati:
  - il suggerimento mostra "New releases install in place and reopen your windows", poi "Checking…",
    "Up to date" o "Version X is available";
  - *Check now* manuale aggiunge il toast con l'esito;
  - l'interruttore *Check for updates automatically* resta l'ultima riga della lista.

Verifica: svelte-check 0/0 (270 file), vitest 36/36. Istanza devtest con area client di 1280×720:
- lista in cima e in fondo, con il piè fermo;
- *Check now* passa da "Checking…" (pulsante disabilitato) a "Up to date", con il toast "Orbit is up to date";
- con `updates.available` simulato dal modulo compaiono "Version 1.0.1 is available", **Update…** e il pulsante
  *Update* nella barra in alto.

### Misure di performance della 1.0 (2026-10-11)
Domanda dell'utente: com'è messa la leggerezza, se la GPU è sfruttata, cosa migliorare. Le ultime misure erano
della v0.2.0 (M21, M28, M36).

Metodo:
- build release isolata (`orbit-perf`, profilo `com.visialab.lume.perftest`) aperta su un **clone** del repo Orbit;
- finestra 1280×800, WebView2 154;
- RAM privata reale (private working set) di core e WebView2; CPU in % di **un** core.

| Scenario | WebGL off (default) | WebGL on |
|---|---|---|
| Finestra vuota (1 shell) | 105 MB | — |
| Repo aperto, 1 terminale, a riposo | 120 MB | 127 MB |
| + 3 file e 4 terminali, a riposo | 155 MB | 158 MB |
| Dopo 30.000 righe in un terminale (scrollback pieno) | 165 MB | 152 MB |
| CPU a riposo | ~0 % | ~0 % |
| Spinner tipo Claude (8 righe ridisegnate a 10 fps) | 14,7 % | 5,6 % |
| Raffica di 30.000 righe colorate | 0,94 s di CPU | 0,36 s di CPU |
| VRAM del processo GPU | 35–40 MB | 47–59 MB |

- **Avvio**: prima pittura 0,36 s dopo l'avvio del processo, finestra visibile a ~0,63 s.
- **GPU**: WebView2 compone e rasterizza sulla GPU: `gpu_compositing`, `rasterization` e più thread di raster
  attivi, ANGLE/Direct3D 11 sulla scheda dedicata, WebGL e WebGPU disponibili. Il terminale usa la GPU solo
  col WebGL di xterm: ~2,6× meno CPU con lo spinner, con RAM praticamente uguale e +10–20 MB di VRAM. (Il
  confronto sulla raffica non regge: ripetuta nella M62, varia di ±30 % da una prova all'altra.)
- **Uso reale** (l'Orbit 1.0.0 installato, 1 finestra, 5 terminali di cui 4 chat Claude, WebGL acceso):
  - Orbit: 243 MB, di cui renderer 138 e GPU 55; CPU 0,13 % della macchina; VRAM 127 MB.
  - I 4 processi `claude` pesano ~3 GB, fuori da Orbit.
- **Rispetto alla 0.x**: 206–225 MB a riposo allora, 105–120 MB oggi. Il calo viene in gran parte da WebView2.
- **Dimensioni**: binario 6,46 MiB, NSIS 3,13 MiB, MSI 3,86 MiB, `dist/` 2,85 MiB. Il chunk d'ingresso è di
  553 KiB (184 KiB gzip) e contiene CodeMirror, importato staticamente da `outline.ts` tramite
  `symbols.svelte.ts`: prima della M29 era di 174 KB.

Punti caldi trovati rileggendo il codice (le misure sopra non li coprono):
- **Ogni `fs-changed` lavora su tutto il progetto.** Rifà l'albero, chiama `git_status` e `git_upstream`, che
  sono comandi sincroni e quindi girano sul thread principale, e rifà la scansione completa dell'indice: ogni
  file viene riletto, e il risultato passa da JS e torna su disco. Durante una sessione Claude succede a ogni
  salvataggio.
- **Indice del codice in `$state` profondo.** `$state.raw` non è usato da nessuna parte, quindi ogni simbolo
  diventa un proxy; `contextAt` e `lensesFor` scorrono tutti i simboli.
- **Attività.** Ogni transcript che cambia viene riletto per intero, ogni scansione clona tutte le unità, e la
  cache in Rust non ha limiti.
- **Minori:**
  - animazioni di attenzione infinite su `box-shadow`;
  - log diagnostico acceso di default, con un buffer di 2000 voci in stato profondo;
  - scrollback di 5000 righe per ogni terminale montato (~7–10 MB di heap JS quando è pieno).

Lezioni di collaudo:
- un clic a coordinate fisse ha dato il fuoco all'editor dell'istanza di prova, aperta sul repo vero con
  l'autosave acceso: il comando digitato è finito in un sorgente (ripristinato con `git checkout`);
- `button.newt` seleziona per primo "New Claude chat": ha avviato 3 sessioni Claude ferme, chiuse subito.

Regole per le prove: clone del repo, `autosave:false`, `aria-label="New terminal"`, fuoco al terminale via
`.xterm-helper-textarea` col controllo di `document.activeElement`, e prova interrotta se compare `claude.exe`.
Niente sessioni Claude vere nei test: consumano i token dell'utente.

---

## Milestone 62 — prestazioni: tutti i punti caldi, misurati prima e dopo

Richiesta dell'utente dopo le misure della 1.0: «procedi con tutti i punti di miglioramento individuati e fai
dei test prima e dopo per verificare il guadagno e la correttezza degli interventi».

**Metodo.**
- Due build release isolate (profilo `com.visialab.lume.perftest`): `orbit-base.exe`, congelata prima di
  toccare il codice, e `orbit-after.exe` alla fine. Stessi banchi, stessi parametri, macchina libera.
- Corpus grande fatto con sorgenti già sul disco (librerie npm e crate Rust), sotto git e fuori dal repo:
  5.392 file (4.778 Rust, 615 JS/TS), 69 MB di sorgenti, 50.109 simboli, cioè il tetto dell'indice.
- Il carico "tipo Claude" è sintetico: uno script modifica un file al secondo (una funzione nuova in un `.rs`,
  una costante in un `.js`, un file creato e uno cancellato ogni 5 s). Lo spinner è uno script che ridisegna
  righe. Mai sessioni Claude vere.
- Sonda di latenza: ogni 50 ms la pagina chiama un comando banale (`app_version`) e ne misura l'andata e
  ritorno. Un comando sincrono pesante sul thread principale la blocca.
- Gli strumenti sono in `artifacts/devtest/perf/` (locale, con README).

| Banco | Prima (1.0) | Dopo (M62) |
|---|---|---|
| Modifiche a raffica, 30 s: CPU | 95 % di un core | 23 % |
| — backend / renderer / IPC (browser) | 54 / 26 / 10 % | 17 / 3 / 1,7 % |
| — latenza IPC p95 / p99 / massima | 136 / 163 / 215 ms | 1,5 / 1,9 / 81 ms |
| — richieste oltre 100 ms | 79 su 455 | 0 su 653 |
| — RAM al picco | 551 MB (renderer 463) | 193 MB (renderer 84) |
| Corpus aperto, a riposo: RAM | 227 MB | 186 MB |
| — heap JS (dopo la garbage collection) | 71 MB | 14,6 MB |
| — backend Rust | 7 MB | 32 MB (cache dell'indice) |
| A riposo dopo le modifiche | 226 MB | 151 MB |
| Cursore, 400 righe in un file indicizzato: script | 22.945 ms | 684 ms |
| — lavoro della pagina / CPU | 25.364 ms / 80 % | 2.077 ms / 32 % |
| — tempo per inviare i 400 tasti | 33 s (pagina occupata) | 9,6 s (ritmo normale) |
| Avviso di attenzione acceso: CPU | 20,1 % di un core | 2,5 % |
| 18 terminali con WebGL: contesti vivi | 16 (2 tornati al DOM) | 1 |
| — VRAM / RAM | 173 / 163 MB | 84 / 145 MB |
| Indice (Rust): un file cambiato | ~310 ms (scansione completa) | 85 ms |
| Attività (Rust): transcript live da 40 MB | 134 ms a scansione | 4,3 ms |
| Chunk d'avvio | 553 KiB (184 gzip) | 265 KiB (90 gzip) |
| Prima pittura / finestra visibile | 318 / 555 ms | 328 / 541 ms (invariati) |

Altri dati:
- RAM a riposo con le impostazioni predefinite della M62 (WebGL acceso, solo sul terminale visibile), repo
  Orbit aperto: 120 MB con un terminale, 159 MB con tre file e quattro terminali. Con la 1.0 erano 120/155 MB
  col WebGL spento (il vecchio default) e 127/158 MB acceso.
- Lo spinner tipo Claude costa 14,7 % di un core col renderer DOM e 5,1–5,6 % col WebGL (1.0 e M62): il
  codice del disegno non cambia, cambia il default. La raffica da 30.000 righe costa 0,7–0,95 s di CPU in
  entrambe le build (prove alternate, una sola istanza di prova alla volta: due istanze sullo stesso profilo
  condividono il browser di WebView2 e la porta CDP, e un primo giro così era da buttare).
- Cursore su un file oltre il tetto dell'indice (nessuna barra dei correlati né lenti): −5 % soltanto, il
  costo lì è di CodeMirror. Il primo banco "cursore" era stato fatto per sbaglio su un file così.

**Interventi.**
1. Terminali:
   - testo sulla GPU (WebGL) acceso di default, con una migrazione una tantum (`webglM62`, come `uiV09`);
   - il contesto WebGL esiste solo per i terminali visibili: un `IntersectionObserver` lo crea alla
     comparsa e lo rilascia 3 s dopo, e l'impostazione si applica dal vivo;
   - storico configurabile (1.000–10.000 righe, default 3.000; prima 5.000 fisse).
2. Avvisi di attenzione: l'anello su `box-shadow` animato all'infinito diventa transform/opacity, cioè solo
   il compositore. Tutti i pallini pulsano 4 volte e poi restano accesi fermi.
3. Log diagnostico:
   - array semplice più un contatore reattivo, al posto di uno stato profondo da 2.000 voci;
   - non registra più tasti, frecce e report del mouse;
   - spento per i profili nuovi (chi l'aveva acceso lo tiene).
4. Avvio: `outline.ts` si importa alla prima apertura di *Vai al simbolo*; prima portava CodeMirror nel chunk
   d'avvio.
5. Indice, frontend:
   - `symbols` e `refs` in `$state.raw`;
   - mappe ricostruite una volta per indice (`symbolMaps.ts`: per file, per nome, costruttori,
     implementatori) invece di scansioni complete a ogni riga del cursore e a ogni lente;
   - prima `rebuildSemSets` copiava l'array degli implementatori a ogni base (quadratico).
6. Indice, backend:
   - incrementale per file (data e dimensione), con un dizionario degli identificatori;
   - stesso giro, stesso ordine, stesso tetto, quindi stesso risultato;
   - versioni dei simboli e dei conteggi: sull'IPC passa solo ciò che il frontend non ha;
   - la cache `.orbit/index` la scrive il backend (prima il frontend rimandava 5 MB indietro a ogni scansione).
7. Cartelle ignorate da git (`git::ignored`):
   - indice, riferimenti, ricerca e Quick Open le saltano;
   - il watcher manda `{ paths, ignoredOnly }`: un lotto tutto in cartelle ignorate non rifà git né indice.
   Un caso vero: l'indice del repo Orbit entrava in `artifacts/` e, coi file di prova, arrivava al tetto.
8. Thread principale: tolti da lì `git_status`/`diff`/`log`/`graph`/`show`/`branches`/`upstream`,
   `read_dir`/`read_file`/`write_file`, la ricerca e `list_files` (`#[tauri::command(async)]`). Ahead/behind
   memorizzato per coppia di commit.
9. Frontend del watcher:
   - `git status` accorpato: una lettura alla volta, chi arriva intanto aspetta la successiva;
   - albero: si rileggono solo le cartelle che contengono i percorsi cambiati, conservando espansione e figli.
10. Attività:
    - transcript letti dal punto in cui ci si era fermati, con lo stato della segmentazione ripreso
      (`Fold`);
    - le 500 unità restituite si scelgono per riferimento e si clonano solo quelle;
    - frontend: `$state.raw`, oggetti delle unità invariate riusati, righe della timeline con chiave stabile.
11. Ricerca: minuscole una volta per file, binari saltati (un byte nullo nei primi 8 KB), file senza il testo
    scartati subito.
12. Quick Open: l'elenco dei file (fino a 20.000) sta fuori dallo stato reattivo e si libera alla chiusura.

**Correttezza.**
- Test: `cargo test` 55/55 (+7), `vitest` 40/40 (+4), `svelte-check` 0/0.
  - Attività: equivalenza col vecchio algoritmo su transcript casuali letti a pezzi, anche a metà riga;
    file riscritto o accorciato; ultima riga senza a capo; ordinamento e `live` della scansione.
  - Indice: incrementale uguale alla scansione completa dopo modifiche, aggiunte, cancellazioni e rinomine;
    cartelle ignorate. Le mappe dei simboli uguali alle vecchie scansioni su 60 indici casuali (lenti,
    contesto, definizioni, insiemi semantici).
- Confronto prima/dopo nell'app:
  - indice del corpus identico (50.109 simboli e 29.802 conteggi, file `.orbit/index` uguali);
  - unità della vista Attività identiche sui transcript veri (hash di 189 unità, in sola lettura);
  - sul corpus intero l'incrementale coincide con la scansione completa anche col tetto.
- Controlli funzionali:
  - migrazione WebGL, e scelta dell'utente rispettata al riavvio;
  - WebGL al cambio scheda (dopo 3 s resta 1 contesto vivo);
  - albero su creazione e cancellazione;
  - barra dei correlati, lenti, vista Attività.

**Costi e cambi di comportamento.**
- La cache dell'indice tiene ~25 MB nel backend su un progetto enorme, qualche MB su uno normale. Il totale
  scende lo stesso, perché il renderer cala di molto di più.
- File in cartelle ignorate da git non compaiono più in indice, riferimenti, ricerca e Quick Open (come in VS
  Code). Nell'albero sì.
- Storico del terminale: 3.000 righe di default, modificabile nelle Impostazioni.
- I pallini di attenzione pulsano 4 volte e poi restano accesi.
- L'avvio non cambia in modo misurabile su questo PC: il chunk dimezzato pesa di più su macchine lente.

**Lezioni di collaudo.**
- In PowerShell `measure` e `kill` sono alias, e una funzione con quel nome non viene chiamata; `$p` e `$P`
  sono la stessa variabile.
- Corpus e cartelle di build di prova vanno fuori dal repo: l'Orbit dell'utente li indicizzava. Era il bug
  delle cartelle ignorate, corretto qui.
- Il banco "cursore" va fatto su un file sotto il tetto dell'indice.
- Le build lunghe vanno a priorità bassa (`BelowNormal`, 8 job) se l'utente usa il PC.

---

## Milestone 63 — stili del cursore per editor e terminale

Richiesta dell'utente: «possiamo fare più figo il cursore di scrittura? … su internet ho visto dei cursori fighi
con delle animazioni». Le scelte sono state fatte insieme:
- **un laboratorio interattivo** (`artifacts/cursor-lab.html`, locale), con tutte le opzioni trovate nei
  terminali e negli editor più curati:
  - Kitty: la scia `cursor_trail`;
  - Ghostty: gli shader della comunità per scia elastica, cometa, fiammata, onda e "boom";
  - Neovide: gli effetti particellari;
  - Alacritty: il lampeggio che si ferma dopo qualche secondo;
  - WezTerm: il cursore a colori invertiti;
  - VS Code: gli stili del lampeggio e la scivolata solo sui salti;
- **tre giri di domande**, per decidere cosa resta fisso e cosa diventa un'impostazione.

**Scelte dell'utente.**
- Default sobrio, cioè "Morbido".
- Nelle Impostazioni, stili pronti più "Customize".
- Come effetti solo scia e alone: niente particelle, onde, scintille.
- Scelte separate per editor e terminale.

**Cosa c'è.**
- **Stili** (uno per l'editor, uno per il terminale):
  - Smooth (Morbido): scivola in 100 ms, lampeggio sfumato;
  - Classic: nessuna scivolata, lampeggio a scatti;
  - Comet: Morbido + la scia di Kitty;
  - Elastic: Morbido + la scia di Neovide, con la testa già arrivata e la coda che insegue;
  - Blaze: Morbido + la scia calda con alone degli shader di Ghostty.
  - Nel terminale gli stili non lampeggiano: mentre Claude ridisegna lo schermo il lampeggio ripartirebbe di
    continuo (è il problema segnalato con WezTerm). Default: Smooth ovunque.
- **Customize:**
  - forma: nell'editor linea sottile, normale o spessa, blocco, blocco vuoto, sottolineato; nel terminale
    forme separate per shell e **chat di Claude**, con la **barra** di default nella chat;
  - scivolata: no, solo nei salti, sempre;
  - stile del lampeggio: no, a scatti, sfumato, fase, espansione;
  - scia: nessuna, cometa, elastica, fiammata, con lunghezza corta, media o lunga;
  - alone: no, fisso, che respira.
  Ritoccare un'opzione rende lo stile "Custom", se non coincide più con uno pronto.
- **Fisso per tutti:**
  - colore d'accento;
  - il lampeggio (e il respiro dell'alone) **smette dopo 15 s** di inattività, come Kitty: nessuna
    animazione infinita;
  - un terminale senza fuoco mostra un blocco vuoto;
  - nel terminale, gli spostamenti a meno di 70 ms l'uno dall'altro e più lunghi di una cella saltano senza
    scivolata né scia (output veloce, ridisegni).
- La vecchia "Smooth caret" è sostituita. Chi l'aveva spenta ritrova la scivolata spenta (migrazione).

**Come funziona.**
- `caretStyles.ts`: stili, opzioni e validazione; logica pura, testata.
- `editor/caret.ts`: un ViewPlugin e un tema di base. Il lampeggio a scatti di CodeMirror, che agisce su tutto
  lo strato dei cursori, si spegne; lampeggia il `.cm-cursor`, con le classi messe attraverso gli attributi
  `data-caret-*` dell'editor. "Solo nei salti" mette `data-caret-snap` per due fotogrammi dopo una modifica
  del testo. La scia prende la posizione da `coordsAtPos` in una `requestMeasure`.
- `terminalCaret.ts`: xterm non sa animare il proprio cursore, quindi Orbit ne disegna uno sopra
  `.xterm-screen`, mentre quello di xterm resta una barra di 1 px trasparente, anche senza fuoco.
  - Posizione: `buffer.cursorX/Y`, letta dopo ogni disegno; un fotogramma vede solo la posizione finale, quindi
    i salti intermedi dei ridisegni non si vedono. Dimensione della cella dalla griglia (`ResizeObserver`).
  - Cursore nascosto dal programma: lo stato interno di xterm, con un hook del parser (`?25l`/`?25h`) come
    riserva.
  - "Solo nei salti" nel terminale: un passo di una cella entro 150 ms da un tasto è scrittura.
- `caretTrail.ts`: le scie. I quattro angoli del cursore inseguono la destinazione, quelli "davanti" più in
  fretta; si disegna l'inviluppo convesso. Il canvas nasce alla prima scia e il ciclo di disegno gira solo
  finché una scia è viva.
- Le schede ✨ (la stessa regola di `tabIcon`) passano `chat` al terminale; la finestra flottante lo ricava
  da titolo e shell.

**Verifica** (istanza di prova isolata, su un clone del repo, solo shell, nessun Claude):
- **terminale:**
  - il cursore coincide al pixel con la cella di xterm, con e senza fuoco e dopo aver scritto;
  - blocco pieno con il fuoco, blocco vuoto senza;
  - scompare con `?25l` e torna con `?25h`;
  - durante una raffica di 3.000 righe resta sulla cella giusta, senza inseguire l'output;
  - una scheda col titolo "Claude" (simulata, senza avviare Claude) passa alla barra, e torna al blocco;
- **editor:**
  - linea di 2 px e lampeggio di CodeMirror spento;
  - il lampeggio sfumato parte dopo 0,7 s e **smette dopo 15 s**;
  - il blocco è largo un carattere;
  - con la cometa, al primo salto nasce il canvas della scia;
  - "solo nei salti": lo snap c'è dopo una scrittura e non dopo un salto;
- **CPU a riposo** dopo lo stop del lampeggio: 0,6 % di un core, sulla build di debug con Vite;
- **test:** `vitest` 44/44 (+4 sugli stili), `svelte-check` 0/0.

## Milestone 64 — Impostazioni in una finestra grande a categorie

Richiesta dell'utente: «forse dovremmo rivedere la pagina di settings, col tempo si sta ampliando e il modal
attuale mi sembra non più molto adeguato». Le scelte, con tre domande:
- una **finestra grande a categorie**, come in JetBrains: ricerca in alto, categorie a sinistra, versione in
  fondo;
- **sei categorie**;
- la finestra delle scorciatoie diventa la **categoria Keyboard**.

**Cosa c'è.**
- Una finestra di 900 × 660 px (si stringe con la finestra di Orbit) con sei categorie:
  - **Appearance**: tema, con una miniatura dipinta coi colori di ciascuno; accento; transizioni;
  - **Editor**: font, dimensione, cursore con anteprima, code lens, autosave, apertura dei Markdown;
  - **Terminal**: font, dimensione, cursore con anteprima, GPU, scrollback;
  - **Claude**: avvio di Claude nel terminale, notifiche, e la strada per il menu Claude del progetto
    (*Add / remove prompts…*, *Edit JSON*);
  - **Keyboard**: preset ed elenco completo delle scorciatoie, ribindabili in Custom;
  - **Updates & logs**: controllo automatico degli aggiornamenti, log diagnostici, visualizzatore.
  - La famiglia del font è una sola: compare in Editor e in Terminal, con la nota "shared with …".
- **Ricerca** su voci e scorciatoie di tutte le categorie, mentre si scrive:
  - tutte le parole, in qualsiasi ordine, su nome, descrizione, parole chiave e categoria ("zoom" trova le
    dimensioni dei font);
  - i pezzi trovati sono evidenziati; a sinistra le categorie senza risultati si spengono, le altre dicono
    quanti;
  - all'apertura il fuoco è già nella ricerca, come in JetBrains e VS Code; `Ctrl+F` ce lo riporta;
  - `Esc` svuota la ricerca, un secondo `Esc` chiude.
- **Anteprime del cursore.** La finestra copre l'app, quindi lo stile si prova lì dentro:
  - Editor: un vero CodeMirror, col tema e il cursore dell'editor (clic, frecce, testo);
  - Terminal: un xterm **senza processo dietro**, con lo stesso `TerminalCaret` dei terminali veri. L'eco la
    fa il componente: testo, frecce, Home/End, Invio, Backspace, Ctrl+C. Le schede *Shell* / *Claude chat*
    mostrano le due forme; non parte né una shell né Claude;
  - seguono le impostazioni dal vivo; arrivano a richiesta (CodeMirror e xterm solo quando si apre la
    categoria), con l'altezza già riservata, così le voci sotto non saltano.
- Si riapre sull'ultima categoria vista.

**Come funziona.**
- `Settings.svelte`:
  - ogni voce è un dato in `ROWS`: categoria, nome, descrizione (con il `codice` fra backtick) e parole
    chiave;
  - lo snippet `control` disegna il controllo di ogni voce, così la ricerca lavora sui dati e non sul markup;
  - `settingsUI.section` ricorda la categoria; `openSettings(section?)` apre quella data. La TopBar passa
    `() => openSettings()`: con `onclick={openSettings}` l'evento diventerebbe la categoria.
- `searchText.ts` (`queryTerms`, `matchesAll`, `segments`: puro, 6 test) e `MatchText.svelte` per l'evidenza.
- `SettingsKeyboard.svelte` (era `ShortcutsDialog.svelte`, spostato con `git mv`): ora solo l'elenco, già
  filtrato.
  - Nei risultati della ricerca il gruppo va in testa alla voce ("Editor › Zoom font"): un titolo "EDITOR"
    sotto "KEYBOARD" si confondeva con la categoria Editor.
  - I tasti ribindabili prendono finalmente lo stile dei `<kbd>`: `<button class="kbd">` non lo riceveva.
- `EditorCaretPreview.svelte` e `TerminalCaretPreview.svelte`. Per condividerli:
  - il tema di xterm è passato in `terminalTheme.ts`;
  - il CSS del cursore del terminale è passato in `terminalCaret.css`, importato dal modulo: ce l'ha chiunque
    usi `TerminalCaret`, anche senza un `Terminal.svelte` montato.
- `Esc`: la ricerca ferma l'evento prima del `Backdrop`. La cattura di un tasto (Custom) ascolta in fase di
  cattura, quindi `Esc` annulla la cattura senza chiudere la finestra.
- Centratura con `left`/`top: round(down, …, 1px)`. Con `margin: auto` o con un transform, in una finestra
  larga un numero dispari di pixel il pannello cadeva a x = 254,5 e il testo si sfocava.
- Rimossi `shortcutsUI`, `openShortcuts`, `closeShortcuts` e il caricamento della vecchia finestra in
  `App.svelte`.

**Dimensioni.**
- Chunk d'avvio: 268,5 KiB (90,6 gzip), contro 267,7 della M63: +0,8 KiB (l'icona della tastiera, la
  categoria ricordata).
- Le anteprime sono chunk a parte (1,3 e 3,1 KiB, più CodeMirror e xterm, che erano già a richiesta).
- Rollup ora chiama `terminalCaret-*.js` il chunk condiviso da `Terminal.svelte` e dall'anteprima (xterm più
  il cursore): resta a richiesta.
- README e ARCHITECTURE dicevano ~264–265 KiB, il valore della M62: la M63 l'aveva già portato a 267,7
  (gli stili del cursore servono all'avvio). Ora dicono ~268.

**Verifica** (istanza di prova isolata, clone del repo, nessun Claude):
- **finestra:**
  - tutte e sei le categorie, nei temi VS 2026 e Orbit Light;
  - posizione intera: 254, 70, 900 × 660 in una finestra di 1409 × 800;
- **ricerca:**
  - "font" → Editor 2, Terminal 2, Keyboard 1 ("Zoom font"), le altre spente, 5 evidenze;
  - "zoom" → le due dimensioni dei font (parola chiave) e due scorciatoie;
  - "zzz" → "No settings match";
  - `Ctrl+F` dalla colonna delle categorie → fuoco nella ricerca;
  - `Esc` → la svuota, poi `Esc` → chiude;
- **anteprima editor:** fuoco, linea di 2 px, attributi `data-caret-*` giusti, scia (Comet) al salto con Home;
- **anteprima terminale:**
  - eco; cursore sulla cella giusta (colonna 20 → 156 px, 7,8 px a cella);
  - Home → colonna 10; Invio → riga nuova;
  - scheda *Claude chat* → barra di 2 px, col fuoco rimasto nel terminale;
  - la forma cambiata da *Customize* si aggiorna dal vivo nello stesso xterm;
- **Keyboard:**
  - *Customize…* → Custom, con la nota per ribindare;
  - clic su un tasto → "Press keys…"; `Esc` annulla senza chiudere;
  - *Delete* → di nuovo Orbit;
- nessun errore in console; `svelte-check` 0/0; `vitest` 50/50 (+6).

## Milestone 65 — cambio repo: un movimento solo anche quando i file tardano

Segnalazione dell'utente: «le animazioni sulle finestre a volte sono scattose perché partono con una misura
target, poi viene caricato il documento o arriva un'altra informazione e quindi il target cambia e si
ridimensionano 2 volte». Succedeva cambiando repo, non sempre.

**Causa.**
- Il cambio repo è una transizione sola (M56): `loadSession` decide subito larghezze ed editor collassato
  dalle schede salvate.
- Ma `openRoot` imposta `rootPath` appena letta la cartella, **prima** che le schede siano caricate:
  `restoreGroups` legge un file dopo l'altro e assegna i gruppi solo alla fine.
- In quell'intervallo l'effetto di `App.svelte` vedeva una cartella aperta senza schede e programmava il
  collasso dell'editor dopo 400 ms.
- Se il caricamento durava di più (molte schede, file grandi, disco occupato), l'editor si stringeva e poi
  si riallargava all'arrivo delle schede: **due movimenti**. Sotto i 400 ms non succedeva nulla, da qui
  l'intermittenza. Le letture più leggere della M62 lo rendevano più raro, non impossibile.

**Riprodotto** nell'istanza di prova con le letture rallentate. `invoke` di Tauri non è riscrivibile, ma
l'IPC passa da `window.fetch` (`http://ipc.localhost/<comando>`): `read_file` + 300 ms.
- Cambio verso una cartella con 3 schede (936 ms):
  - a 421 ms l'editor collassa (693 → 220 px);
  - a 943 ms si riapre (220 → 693).
- Con una scheda sola (328 ms) nessun movimento.

**Correzione.**
- L'effetto in `App.svelte` aspetta anche la fine di `workspace.switching`, non solo un `rootPath` non nullo.
- A fine cambio `settleEditorCollapsed` allinea il collasso alle schede davvero aperte, dentro la stessa
  transizione. Di norma non cambia nulla: è una rete di sicurezza.
- `promoteLight` ("Open … as project" da una finestra leggera) aveva lo stesso difetto in due punti:
  - l'editor collassava per una sessione di progetto senza schede e si riapriva coi file della finestra
    leggera, ora passati come `extraTabs` a `loadSession`;
  - la barra laterale arrivava dopo l'apertura dei file; ora si riapre all'inizio, insieme al resto.

**Verifica** (istanza di prova, cartelle di prova nello scratchpad, nessun Claude):
- con `read_file` + 300 ms per file:
  - verso 3 schede (945 ms): 0 movimenti, l'editor resta a 693 px;
  - verso 1 scheda con + 600 ms: 0 movimenti;
  - verso una cartella senza schede: 1 movimento (collasso);
  - da lì verso 3 schede: 1 movimento (espansione subito), nessun altro all'arrivo dei file;
- cambi normali, senza ritardo: al massimo un movimento ciascuno;
- comportamento di sempre conservato:
  - aprire un file in una cartella vuota espande subito;
  - chiudere l'ultima scheda collassa dopo ~409 ms;
- `svelte-check` 0/0, `vitest` 50/50.

Possibile, non visto: con due o più chat affiancate in disposizione automatica, la disposizione si
ricalcola sulla larghezza che si sta animando. Se a metà transizione passa la soglia (righe ↔ colonne), i
riquadri scattano. Da guardare se l'utente lo nota.

## Milestone 66 — riaprire Orbit e ritrovare tutto: terminali, chat, posizione nei file

Richiesta dell'utente: «è possibile fare in modo che quando apro Orbit ritrovo esattamente la situazione che
avevo lasciato quando avevo chiuso? repo aperti, file aperti su ogni repo, chat recuperate di Claude ecc?».

**Com'era.**
- Già ripristinati:
  - le finestre (avvio "nudo"), con posizione;
  - la lista delle repo di ogni finestra;
  - per ogni repo: schede dell'editor, split e larghezze dei pannelli.
- Una finestra chiusa da sola, prima delle altre, non torna (come VS Code); "Close all" le riapre tutte.
- **Non** ripristinati:
  - terminali e chat di Claude: all'avvio una chat nuova, o una shell vuota; le vecchie si riprendevano a
    mano dall'Attività;
  - la disposizione delle chat affiancate;
  - le cartelle espanse dell'albero;
  - la posizione nei file. L'editor ripartiva dall'inizio anche **a ogni cambio di scheda**: è ricreato a
    ogni cambio.

**Scelte dell'utente** (quattro domande):
- chat: **riprendere subito quelle in vista**, le altre quando le apri;
- shell: nuove, nella stessa cartella, senza l'output di prima;
- schede di Esegui: **non tornano**;
- in più: cursore e scroll nei file, cartelle espanse dell'albero.
- Le finestre chiuse una alla volta restano come sono.

**Quale chat c'è in una scheda.** Claude Code tiene un registro delle chat aperte,
`~/.claude/sessions/<pid>.json`: pid del processo, `sessionId`, `cwd`, avvio, stato.
- `claudeproc.rs` visita i discendenti della shell di ogni scheda (ToolHelp su Windows, `ps` altrove) e legge
  la voce del primo processo che ne ha una.
- Vale anche per un `claude` lanciato a mano in una shell.
- Probabilmente vale anche dopo un `/clear` o un `/resume` fatti dentro la chat: il registro sembra seguire
  la sessione corrente. Non verificato con un claude vero, per non consumare token.
- Si scartano le voci partite prima della shell (pid riciclati).
- Niente flag aggiunti alla riga di comando (`--session-id` romperebbe un `command` personalizzato in
  `.orbit/claude.json`) e niente hook nelle impostazioni di Claude.
- Il frontend rilegge ogni 15 s e un'ultima volta prima di chiudere.

**Cosa si salva e come torna.**
- Per finestra, sotto `<winKey>|#terminals`: le schede di tutte le sue repo. Per ognuna nome, colore,
  cartella, shell e, per le chat, conversazione e cartella; poi la scheda attiva e i riquadri affiancati
  (disposizione, modalità, dimensioni).
  - `save_state` ha `pointer: false`, così non diventa "l'ultima cartella aperta".
  - Le schede estratte in finestra flottante restano note (`terminals.floating`) e tornano come schede.
- All'avvio tornano **addormentate**, senza processo. `TerminalPanel` sveglia quelle in vista:
  - una chat riparte con `claude --resume <id>` nella sua cartella, con la configurazione della SUA repo
    (rilegge `.orbit/claude.json` e accende la bell come una chat nuova);
  - se il transcript non c'è (chat aperta e mai usata) riparte come chat nuova invece di fallire;
  - le schede di altre repo, o dietro quella attiva, partono quando le apri.
- La chat di default all'avvio ("Launch Claude…") parte solo se la repo non ha schede ripristinate.
- *Resume* dall'Attività su una chat già aperta (anche addormentata) va a quella scheda invece di aprirne
  una seconda.
- **Posizione nei file**, per scheda (gruppo + file):
  - cursore e prima riga in vista sono fuori dallo stato reattivo;
  - il cursore si salva a ogni cambio, la riga in cima dopo uno scroll;
  - con l'editor già smontato non si misura: leggerebbe 0;
  - nella sessione stanno come `views`.
  - Si ritrova anche cambiando scheda.
- **Cartelle espanse**: relative alla radice, nella sessione (`expanded`). La cache dell'albero confronta i
  percorsi con `pathKey` (separatori e maiuscole indifferenti).
- Rifiniture trovate strada facendo:
  - l'autosave della sessione salta il mezzo di un cambio repo, quando la nuova cartella è aperta ma
    schede e albero non ancora (prima poteva scrivere una sessione vuota);
  - chiusa la finestra principale, il processo esce. Prima una finestra flottante rimasta aperta lo teneva
    vivo da sola, senza più dove rientrare.

**Verifica** (istanza di prova, clone del repo):
- **Senza mai un claude vero**:
  - `CLAUDE_CONFIG_DIR` dell'istanza puntava a un registro finto;
  - il comando Claude del clone era `Write-Host` (`echo` di PowerShell senza argomenti chiede l'input e
    bloccava la scheda);
  - un `Start-Sleep` nella scheda faceva da processo della chat, con una voce finta nel registro.
- **Primo ciclo** (shell e "chat" affiancate nel clone, una shell in switch-b, file lungo a riga 310 con la
  300 in cima, src e src/lib espanse, chiusura con la ✕). Al riavvio:
  - shell e chat affiancate come prima, la chat partita con `--resume 11111111-…`;
  - la shell di switch-b addormentata (nessun PTY) e partita al passaggio a switch-b;
  - file a riga 310/300, cartelle espanse;
  - già prima del riavvio, cambiando scheda e tornando, il file restava a 310/300 (prima: riga 1).
- **Secondo ciclo** (una scheda di Esegui, la shell estratta in finestra flottante, transcript della chat
  cancellato). Al riavvio:
  - niente scheda di Esegui;
  - la shell estratta di nuovo come scheda;
  - la chat ripartita come chat nuova.
- **Terzo ciclo**: con una finestra flottante aperta, la ✕ della principale chiude il processo; la chat
  estratta torna come scheda.
- Il resume dall'Attività di una chat già aperta non crea doppioni.
- **Test:**
  - Rust: 4 nuovi (visita dei processi: chat sotto la shell giusta, cicli di pid, registro più vecchio
    della shell o con altro pid, id non validi); `cargo test` 59 passati;
  - `vitest` 50/50, `svelte-check` 0/0.

**Dimensioni.** Chunk d'avvio 274,4 KiB (92,9 gzip) contro 268,5 della M64: +5,9 KiB. Il ripristino dei
terminali serve all'avvio. README e ARCHITECTURE aggiornati a ~274.

**Limiti.**
- Le shell tornano senza l'output di prima (scelta).
- Una chat chiusa con `/exit` lasciando la shell aperta torna come chat (ultima conversazione vista).
- Le finestre chiuse una alla volta non tornano (come prima).

---

## Milestone 67 — documentazione del codice in `docs/`

Richiesta dell'utente: «forse dovremmo popolare la cartella docs con tutta la documentazione aggiornata del
codice». Le scelte, con tre domande:
- un **indice e una pagina per area**;
- profondità "**come funziona + dove guardare**": progetto, flussi, moduli e funzioni con i percorsi,
  insidie;
- **dentro la 1.1.0**, prima del push.

**Cosa c'è.** In inglese, come README e ARCHITECTURE:
- `docs/README.md`: l'indice. Nella vista Docs di Orbit compare come "Overview".
- `docs/ARCHITECTURE.md`: diventa la panoramica, con stack, un processo per finestra, frontend ⇄ backend
  (comandi ed eventi), tipi di modulo, struttura del repo, avvio, convenzioni. Prima erano 687 righe con
  ~400 di "Feature notes" in un'unica lista.
- Undici pagine: `01-frontend-state`, `02-ui-shell`, `03-editor`, `04-terminal`, `05-claude`,
  `06-code-navigation`, `07-persistence`, `08-backend`, `09-settings`, `10-development`, `11-release`.
  - I numeri danno l'ordine sia su GitHub sia nella vista Docs, che toglie il prefisso dal titolo.
  - Ogni pagina ha una tabella dei file, poi come funziona, e rimanda a `NOTES.md` per il perché (le
    milestone citate come M*n*).
- Il README rimanda all'indice. `CLAUDE.md` ha una sezione (fuori da quelle generate da Orbit) che indica a
  Claude dove sono i documenti e di aggiornarli insieme al codice.

**Come.**
- Il contenuto della vecchia ARCHITECTURE, che era aggiornata, è stato ridistribuito e confrontato con il
  codice tramite gli inventari: moduli di stato e funzioni esportate, comandi Tauri con il loro modo
  (sincrono, `(async)`, `async fn`), eventi, componenti con il commento di testa, permessi.
- Errori trovati e corretti strada facendo nelle pagine nuove:
  - l'Attività parte solo quando se ne apre la vista;
  - l'indice salta sempre `node_modules`, `.git`, `target`, `dist`, mentre `.orbit/index` lo esclude il
    watcher, non l'indice;
  - l'elenco reale delle shell.
- Un controllo dei link interni (file e ancore in stile GitHub) su `docs/` e README: nessuno rotto.
- **Onestà sul `/clear`**: README e pagine dicevano che il ripristino delle chat "segue un /clear", che non è
  verificato con un claude vero. Ora dicono solo ciò che è provato (anche un `claude` lanciato a mano).

**Ultimi testi italiani nell'interfaccia**, trovati documentando:
- la shell "Prompt dei comandi" ora è "Command Prompt" (con la mappa del nome breve `cmd`);
- quattro avvisi tradotti: file non trovato dal terminale, salvataggio di `claude.json` non riuscito,
  `claude.json` e `run.json` con JSON non valido.

**Verifica:** `svelte-check` 0/0, `vitest` 50/50, `cargo test` 59 passati, link interni 0 rotti.

---

## Milestone 68 — quattro correzioni trovate scrivendo la documentazione

Alla domanda dell'utente «ci sono altre cose da fare? cose che hai scoperto mentre scrivi la
documentazione?», l'elenco controllato sul codice. L'utente ha scelto di correggere subito i quattro punti
qui sotto. Il testo che Orbit scrive nei progetti (scorciatoie Claude predefinite, sezioni di `CLAUDE.md`)
resta in italiano, per sua scelta.

**1. Scritture git e cancellazioni fuori dal thread principale.** La M62 aveva spostato status, diff, log
ecc., ma non:
- stage, unstage, commit e discard;
- creare e cambiare branch: su un repo grande un cambio di branch riscrive la cartella di lavoro e
  bloccava la finestra;
- `delete_path`: un `node_modules` richiede secondi.

Ora sono `(async)`. Le scritture git passano da un lock (`GIT_WRITE`): prima le metteva in fila il thread
della finestra, e in parallelo due scritture dell'indice si scontrerebbero su `index.lock`. "Stage all" ne
lancia una per file, tutte insieme (`Promise.all`), ignorando gli errori: senza lock si sarebbero persi file
senza avviso.

**2. L'Attività segue `CLAUDE_CONFIG_DIR`**, come già il ripristino delle chat (M66):
`claudeproc::claude_dir()` per la scansione e per il watcher. Prima leggeva sempre `~/.claude/projects`: con
la cartella di Claude spostata, l'Attività restava vuota.

**3. Nomi stabili dei file di sessione.** Il nome era l'hash di `DefaultHasher`, che la libreria standard
non garantisce uguale fra versioni di Rust: se cambiasse, dopo un aggiornamento ogni finestra perderebbe
sessioni e terminali.
- Ora `session_hash` lo calcola da sé: SipHash-1-3 con chiavi zero sui byte della chiave più `0xFF`, cioè
  esattamente quello che `DefaultHasher` dava.
- I nomi non cambiano. Un'implementazione indipendente in Python riproduce il nome del file di sessione
  reale indicato da `last_session.txt`.
- Due test: uguaglianza con `DefaultHasher` (con questo Rust) e valori fissi.

**4. Git Bash dovunque sia installato Git.** Prima solo `C:\Program Files\Git\bin\bash.exe`. Ora anche
`%ProgramW6432%`, l'installazione per utente (`%LOCALAPPDATA%\Programs\Git`) e accanto al `git.exe` del
PATH (`<radice>\cmd`, `\bin`, `\mingw64\bin` → `<radice>\bin\bash.exe`; funzione pura con test). Mai il
`bash.exe` di System32, che è WSL.

**Verifica** (istanza di prova ricompilata, clone del repo, `CLAUDE_CONFIG_DIR` su una cartella finta):
- **sessioni**: la finestra torna com'era (stessi nomi dei file);
- **shell**: Git Bash trovato, "Command Prompt";
- **Attività**: con la cartella finta mostra solo il transcript sintetico (1 unità, `C:/fake/repo`), non i
  progetti veri;
- **git**:
  - "Stage all" su 3.008 file lanciati insieme: tutti in stage, nessuno perso. Intanto l'IPC rispondeva
    in 2–3 ms; prima la finestra sarebbe rimasta ferma per minuti. Il test includeva per errore una
    cartella da 3.000 file;
  - 8 stage e 8 unstage in parallelo: 8 e 0, nessun errore;
  - cambio di branch avanti e indietro;
- **cancellazione** di 3.000 file: 0,5 s, con 36 risposte dell'IPC nel frattempo (la più lenta 29 ms);
- `cargo test` 62 (+3), nessun avviso.
- **Inciampo da ricordare**: modificare i Markdown di `docs/` ricarica la pagina di sviluppo (Vite) e
  interrompe un test in corso. Il primo giro si è fermato così ed è stato ripetuto.

---

## Versione 1.1.0

Le milestone **M61–M68** in una release:
- versione e *Check now* sempre in vista;
- le prestazioni della M62;
- gli stili del cursore;
- le Impostazioni a categorie;
- il cambio repo in un movimento solo;
- il ripristino di terminali, chat e posizione nei file;
- la documentazione per sviluppatori in `docs/`;
- quattro correzioni trovate scrivendola (M68).

Titolo "Pick up where you left off", note in `artifacts/notes-1.1.0.md`.

**Preparazione.**
- Versione 1.1.0 nei sei punti, con le due del lockfile a mano.
- Esempi di `New-Release.ps1` aggiornati.
- Build di controllo senza firma, in una cartella temporanea: compila senza avvisi.
  - eseguibile **6,58 MiB** (6,46 nella 1.0);
  - setup NSIS **3,17 MiB**, MSI **3,92 MiB**;
  - chunk iniziale **274,4 KiB** (92,9 gzip; 553 KiB nella 1.0);
  - `dist/` 2,89 MiB.
- Test: Rust 59 passati, `vitest` 50/50, `svelte-check` 0/0.

**Controllo sull'Orbit installato** (sola lettura, prima di rilasciare), sulla catena della M66: shell della
scheda → `claude` → `~/.claude/sessions/<pid>.json` → transcript.
- Funziona sulle tre chat vere aperte.
- Quella senza transcript era una chat mai usata: la sua voce non era mai stata aggiornata dopo l'avvio.
  Al ripristino ripartirebbe nuova, come deve.
- Da provare con un claude vero, dopo l'installazione: riprendere una chat usata, e il comportamento dopo un
  `/clear`.

**Rilasciato in v1.1.0** il 2026-10-11: "Orbit v1.1.0 — Pick up where you left off", tag `v1.1.0` sul commit
`0990838` (la rilettura del README), pubblicata dall'utente con `New-Release.ps1 -Publish` (setup, MSI, le due
firme e `latest.json`). È il primo aggiornamento che gli Orbit 1.0 ricevono da soli.
- Build firmata: eseguibile **6,60 MiB**, setup NSIS **3,17 MiB**, MSI **3,93 MiB**, chunk iniziale **274,3 KiB**.
- Controlli dopo la pubblicazione:
  - firme valide per la chiave di `tauri.conf.json` (Ed25519 sul BLAKE2b-512, verificate con `node:crypto`);
  - i file caricati hanno gli stessi SHA-256 di quelli locali;
  - il `latest.json` servito dall'indirizzo degli aggiornamenti è quello firmato, con le note finali.
- Lezioni:
  - lo script va lanciato in PowerShell 7 (`pwsh`): Windows PowerShell 5.1 lo blocca per la execution policy;
  - senza `-Publish` produce solo gli artefatti in `artifacts/release`; la pubblicazione è un secondo giro, che
    ricompila e chiede di nuovo la password.

---

## Milestone 69 — tante repo nella barra: compressione da destra, presa sempre libera, repo in una finestra nuova

Segnalazione dell'utente (2026-10-12): «quando un utente apre tante repo, la barra in alto si riempie e risulta
difficile spostare la finestra». Prima le alternative, con una pagina di mockup su come lo risolvono altri
programmi (Chrome, Windows Terminal, Firefox, VS Code, IntelliJ, Edge, Arc, Slack…); poi l'idea dell'utente: «se non
c'è più spazio i repo più a destra vengono collassati mentre quelli più a sinistra rimangono come ora; in questo modo
con il riordinamento uno può sempre scegliere quali vedere per intero». Le scelte, con due giri di domande:
- la repo attiva fra le compresse si apre intera **al suo posto**, e cede l'ultima intera alla sua sinistra;
- le compresse sono **iniziali colorate**; il colore della repo compare anche sulle schede intere (l'icona della
  cartella), automatico e cambiabile col tasto destro;
- **56 px** liberi per lato;
- quando non bastano nemmeno le chip, una chip **«+N»**;
- passando su una chip, una **schedina** con branch, chat in attesa e file modificati;
- un extra: **strappare una repo** in una finestra nuova, trascinandola in basso o dal menu, con le chat che
  ripartono là. Non scelti: Alt + trascina, viste a sole icone, selettore unico al centro, colonna laterale.
- dopo il primo collaudo, alla notizia che a 1536 px con 12 repo restava intera solo la prima: «se c'è abbastanza
  spazio non possiamo fare in modo che fino a 3 repo siano espansi?». Le prime **tre** restano intere finché ci
  stanno, e prima di comprimerne una le ultime chip vanno nel «+N»; l'attiva conta fra le tre.

**Perché non si afferrava.** Il `drag.js` di Tauri 2.11 avvia il trascinamento solo se il clic cade *direttamente*
su un elemento con `data-tauri-drag-region` senza valore; con `"deep"` vale tutto il sottoalbero, tranne gli
elementi cliccabili. Lo spazio centrale (`.spacer`) aveva l'attributo senza valore e la striscia delle repo poteva
prenderselo tutto: con 5–6 repo a schermo intero restavano strisce di 3–4 px sopra e sotto i bottoni. Neanche il
logo trascinava: il clic finisce sull'SVG, che non è un `HTMLElement` e viene saltato.

**Cosa c'è.**
- `RepoStrip.svelte`, la striscia uscita da `TopBar.svelte`, e `repoStrip.ts`, logica pura con il piano:
  1. tutte intere, se ci stanno;
  2. altrimenti le prime *k* intere e le altre chip, con *k* che scende da destra; l'attiva resta sempre intera;
  3. arrivati a tre intere (`KEEP_FULL`, l'attiva compresa) o meno, prima di comprimerne un'altra le ultime chip,
     da destra e mai l'attiva, vanno nel «+N»;
  4. al limite resta l'attiva, accorciata con l'ellissi.
- Le larghezze naturali si misurano su una copia invisibile della striscia con ogni repo intera (MutationObserver
  per lista, attiva e branch; ResizeObserver per font e tema). Le schede ricevono larghezze esplicite, così cambiano
  forma con il movimento fluido quando si cambia, aggiunge o riordina una repo, e subito quando si ridimensiona la
  finestra.
- Presa: `gripFor` lascia 56 px per lato e in una finestra stretta cede fino a 12 px, prima di accorciare l'attiva.
  Logo e spazio centrale sono `"deep"`; le schede hanno `"false"`, perché un clic sul loro bordo avvierebbe il
  trascinamento della finestra al posto del riordino.
- Colori (`repoColors.svelte.ts`): la tavolozza delle schede terminale, con l'indice da un hash FNV-1a del
  `pathKey`. Le scelte stanno in `localStorage`, preferenza dell'app condivisa: le altre finestre si allineano con
  l'evento `storage`.
- Schedina: per una repo non attiva, `git_status` al passaggio, in cache per 10 s.
- Menu della scheda: colore (o *Automatic*), *Move to new window*, *Remove from list* (le chip non hanno la ✕).
- **Repo in una finestra nuova** (`repoWindow.ts`). Un processo non può prendere i PTY di un altro: i terminali si
  chiudono qui e la finestra nuova li riapre come dopo un riavvio (M66).
  - Conferma se la repo ha chat vive; se è l'attiva, prima si sistemano le modifiche non salvate.
  - Sessione (`persist.exportSession`) e terminali (`terminalPersist.exportRepoTerminals`, con le chat rilette dal
    registro di Claude Code) si scrivono sotto una chiave di finestra nuova.
  - La repo esce dalla lista (se è l'attiva, prima si passa a una vicina) e i suoi PTY si chiudono, anche quelli
    nelle finestre flottanti, PRIMA che la finestra nuova riprenda le stesse chat.
  - `open_new_window(dir, key, place)`: il figlio riceve `ORBIT_WIN_KEY` e la geometria, come nel respawn del
    "riapri tutte". `"cursor"` mette la sua barra sotto il puntatore, `"beside"` la sposta di 40 px da questa; la
    dimensione è quella normale di questa finestra (`LastNormal` se è ingrandita).

**Trovato e corretto: la chiave di sessione ereditata.** Una finestra riaperta dal "riapri tutte" ha nell'ambiente
`ORBIT_WIN_KEY` e `ORBIT_WIN_X/Y/W/H/MAX`, e `open_new_window` non li toglieva. Una *New window* aperta da lì nasceva
con la STESSA chiave, quindi sessioni e terminali delle due finestre si sovrascrivevano, e si apriva esattamente sopra
la madre. Ora `open_new_window` e le shell dei terminali li tolgono (`winsession::ENV_VARS`): un figlio li riceve solo
se glieli si passa apposta.

**Verifica.**
- Test: `vitest` 66/66 (+16: piano, tre intere, presa, iniziali, colori), `cargo test` 62, `svelte-check` 0/0
  (289 file).
- Istanza di prova isolata (identificativo `devtest`, sul monitor secondario), 12 repo finte con
  `"command": "Write-Host"` e una cartella di Claude finta; larghezze emulate via CDP:
  - 1920 px: 6 intere e 6 chip; 1536: 3 intere, 4 chip e «+5» (prima delle tre intere: l'attiva e 11 chip); 1366:
    2 intere, 2 chip e «+8»; 1250: l'attiva, 2 chip e «+9»; 1100: l'attiva intera e «+11», con la presa a 24 px;
    720: presa a 12 px e attiva accorciata;
  - clic su una chip a 1536 px: si apre intera al suo posto, la terza intera si comprime e le chip in più vanno nel
    «+N»; riordino trascinando l'ultima chip in seconda posizione; schedina («playground | main | No chat waiting |
    3 changed files»); colore scelto e salvato, poi *Automatic*; «+N» con l'elenco delle nascoste e il pallino
    d'attesa;
  - presa (tasto premuto, chiamate IPC registrate): trascinano i lati liberi, il logo, lo spazio fra due schede e la
    fascia di 4 px sopra; la scheda no;
  - *Move to new window* da una repo non attiva: finestra nuova accanto, con la sola repo e una chiave nuova;
  - repo attiva con una chat (un processo figlio della shell, registrato nel registro finto) trascinata fuori:
    etichetta che segue il puntatore, conferma, processo della chat chiuso qui; nella finestra nuova la scheda
    riparte con `Write-Host --resume 11111111-…`;
  - *New window* da una finestra avviata con `ORBIT_WIN_KEY` nell'ambiente: la figlia ha una chiave sua e la
    posizione predefinita;
  - movimento fluido cambiando repo, nessuno ridimensionando.
- Corretto durante il collaudo: a 1100 px la presa piena accorciava l'attiva a 103 px, senza il branch.
  `MIN_STRIP` è passato da 140 a 200, così cede prima la presa.

**Dimensioni.** Chunk d'avvio 285,0 KiB (97,2 gzip) contro i 274,3 della 1.1.0: +10,7 KiB, perché la striscia è nel
primo disegno. `dist/` 2,91 MiB.

**Lezioni di collaudo.**
- In UI Automation i dialoghi nativi posseduti da una finestra (il `confirm` del plugin) sono figli di quella
  finestra, non della radice: cercandoli fra i figli della radice non si trovano. Con Win32 sì (`EnumWindows`,
  classe `#32770`, `BM_CLICK` sul bottone).
- In PowerShell gli alias vincono sulle funzioni: una funzione `Cls` chiamava `Clear-Host`.
- Un `start_dragging` provocato via CDP fa partire il ciclo di spostamento di Windows con il cursore VERO, e la
  finestra di prova si sposta: per le zone di trascinamento bastano le chiamate IPC registrate.
- Una finestra aperta con `"cursor"` compare sotto il puntatore dell'utente, anche sul monitor principale: in
  collaudo va spostata subito.

---

## Versione 1.2.0

La milestone **M69** in una release: tante repo nella barra in alto (compressione da destra in chip colorate, le
prime tre intere, «+N», presa sempre libera), colore e schedina delle repo, una repo in una finestra nuova, e la
correzione della chiave di sessione ereditata dalle finestre figlie. Titolo "Room for all your repos".

**Preparazione** (2026-10-12, sul PC senza la chiave di firma: la pubblica l'utente dall'altro).
- Versione 1.2.0 nei sei punti, con le due del lockfile a mano.
- Build di controllo senza firma, in una cartella temporanea: compila senza avvisi.
  - eseguibile **6,56 MiB** (6,58 nella 1.1.0);
  - setup NSIS **3,17 MiB**, MSI **3,92 MiB** (invariati);
  - chunk iniziale **285,0 KiB** (97,2 gzip; 274,3 nella 1.1.0);
  - `dist/` 2,91 MiB.
- Test: `vitest` 66/66, `cargo test` 62, `svelte-check` 0/0.

**Per pubblicare**, dal PC con la chiave, in PowerShell 7:
1. `git pull`, poi le note qui sotto in `artifacts/notes-1.2.0.md`;
2. `.\scripts\New-Release.ps1 -Notes .\artifacts\notes-1.2.0.md -Title "Room for all your repos"`, poi il setup
   installato sopra la 1.1.0 e provato;
3. di nuovo con `-Publish`;
4. qui: data, tag e misure della build firmata.

Note della release:

```markdown
### Room for all your repos
- When the repository tabs don't fit in the top bar, the ones on the **right collapse into chips** with their
  initials on the repo's color. The **first three** stay whole while they fit, and so does the repo you're
  working in; what still doesn't fit goes into a **+N** menu. Drag a repo to the left to keep it readable.
- **Hover a chip** to see its branch, its waiting Claude chats and its changed files.
- **Every repo has a color**, shown on its folder icon. Right-click a tab to pick another one, or go back to
  *Automatic*.
- Tabs change size in one smooth motion when you switch, add or reorder repos.

### Always room to move the window
- Both sides of the repository row **stay free to grab the window**, however many repos are open. The logo and
  the gaps between tabs drag the window too. Before, with many repos only a few pixels were left.

### Move a repo to a new window
- **Drag a repository tab down out of the top bar**, or choose **Move to new window** from its menu: the repo
  opens in a new Orbit window (where you drop it, or next to this one), with its tabs and its **terminals and
  Claude chats resumed**.
  - If one of its chats is running, Orbit asks first: a reply in progress would stop.
  - Shells start fresh in the new window, as after a restart.

### Fixed
- A *New window* opened from a window that *reopen all* had brought back no longer shares that window's
  session. Before, the two windows overwrote each other's tabs and terminals, and the new one opened right on
  top of the other.
```

**Rilasciato in v1.2.0** il 2026-10-12 sera (20:12 UTC): "Orbit v1.2.0 — Room for all your repos", tag `v1.2.0` sul
commit `652a2bb`, pubblicata dall'utente dall'altro PC con `New-Release.ps1 -Publish`.
- Asset: setup NSIS **3,18 MiB**, MSI **3,93 MiB**, le due firme e `latest.json`.
- Controllato il giorno dopo (da qui, in sola lettura): l'indirizzo degli aggiornamenti serve il `latest.json` della
  1.2.0, con le firme del setup e dell'MSI. Le misure dell'eseguibile firmato restano sull'altro PC.
- Dal PC della chiave, subito dopo la pubblicazione: eseguibile firmato **6,61 MiB**, chunk iniziale **285,0 KiB**; i
  cinque file su GitHub con gli stessi SHA-256 di quelli locali, firme valide per la chiave di `tauri.conf.json`.
- Verificato nell'uso (2026-10-13): riaperto Orbit 1.2.0, la chat di Claude in corso in una scheda è ripartita da
  sola con `claude --resume <id>`. Era il punto lasciato aperto dalla 1.1.0: riprendere una chat usata dopo
  l'aggiornamento. Resta da provare il comportamento dopo un `/clear`.

---

## Milestone 70 — vista Solution nell'Explorer, come il Solution Explorer di Visual Studio

Domanda dell'utente (2026-10-13), su una sua repo .NET: perché l'Explorer di Orbit mostra una struttura
completamente diversa da quella di Visual Studio? Perché Visual Studio mostra la **soluzione**: le cartelle di
soluzione esistono solo nel `.sln` (su disco i progetti stavano tutti nella radice) e quello che non è nella
soluzione non compare. Poi: «sarebbe possibile in Orbit aggiungere una modalità per l'Explorer per visualizzare la
soluzione come su Visual Studio 2026?». Le scelte, con un giro di domande:
- **passaggio**: un bottone nella testata dell'Explorer con il menu delle viste, come lo «Switch Views» di Visual
  Studio (*Folders* più le soluzioni della repo); compare solo se la repo ha un `.sln` o `.slnx`;
- **quello che non è nella soluzione**: un gruppo **«Other files»**, chiuso, in fondo all'albero;
- nell'albero anche il nodo **Dependencies** e l'interruttore **Show All Files**;
- comandi: **Build, Rebuild, Clean** e **Run**.
- Non scelti: Test, «Apri in Visual Studio», le linguette Folders | Solution, una vista a parte nella barra in
  alto, i file esterni nascosti come in Visual Studio.
- Deciso da me, e detto all'utente: la prima volta l'Explorer parte dalle cartelle, poi la vista si ricorda per
  repo.

**Cosa c'è.**
- `solution.rs`, nuovo modulo del backend: `sln_find`, `sln_load`, `proj_load`, `msbuild_path`. Legge i file come
  li legge Visual Studio, senza chiamare MSBuild, con una **valutazione MSBuild ridotta**:
  - le proprietà da `Directory.Build.props`, `Directory.Packages.props`, `obj/<progetto>.nuget.g.props|targets`,
    il progetto e i suoi `Import` locali, `<progetto>.user` e `Directory.Build.targets`, con `Configuration=Debug`
    e `BuildingInsideVisualStudio=true`;
  - condizioni semplici e le funzioni di proprietà più comuni: ciò che non sa valutare conta come vero;
  - per i progetti SDK gli item predefiniti, cioè la cartella del progetto meno `DefaultItemExcludes`, `bin`,
    `obj` e le cartelle nascoste; poi `Include`/`Exclude`/`Remove`/`Update` in ordine di documento, con i glob e
    `%(RecursiveDir)`;
  - solo i tipi di item che il Solution Explorer mostra, più quelli dichiarati con `AvailableItemName` o presenti
    nel `.vcxproj.filters`;
  - con più framework, la valutazione per il primo.

  XML con il lettore a eventi di `quick-xml`: la versione era già nell'albero delle dipendenze, la usa `plist`.
- Frontend:
  - `explorerView.svelte.ts`, nel chunk d'avvio perché serve alla testata: le soluzioni trovate, la scelta per
    repo e Show All Files;
  - `solution.svelte.ts` e `SolutionView.svelte`, caricati solo con la vista;
  - `solutionTree.ts`, logica pura testata: ordinamento, annidamento come Visual Studio, nodo Dependencies,
    comandi.
  - L'albero è un oggetto non reattivo: un contatore fa ricalcolare le righe, e così i 2.700 nodi di una soluzione
    grande non diventano proxy di Svelte.
- La vista: soluzione, cartelle di soluzione, progetti (C#, VB, F#, C++) e il loro contenuto.
  - File annidati: `DependentUpon`, poi le regole di Visual Studio per `.xaml.cs`, `.Designer.cs`, `.resx`,
    Razor e `appsettings.*.json`.
  - Collegati con la freccetta, mancanti in ambra, filtri del C++ come cartelle virtuali.
  - Dependencies con Frameworks, Packages, Projects e Assemblies; *Go to project* da un riferimento.
  - Decorazioni git anche su progetti e cartelle di soluzione; «segui il file attivo».
- Show All Files: in grigio i file non nel progetto, e `bin`, `obj` e le cartelle nascoste, letti quando li si
  apre. Il C++ passa alla struttura su disco.
- Comandi: Build, Rebuild e Clean usano l'MSBuild di Visual Studio, trovato con `vswhere`, in PowerShell; così
  compila anche il C++, cosa che `dotnet build` non sa fare. Senza Visual Studio usano `dotnet`. Run usa
  `dotnet run`. Tutto in una scheda del terminale, come Esegui ▶.
- Crea, rinomina ed elimina solo dove il disco è il progetto: progetti SDK, file esclusi e «Other files».
- Aggiornamenti dal watcher: la soluzione, un file di progetto, `.filters`, `.user`, `Directory.*` o un file
  dentro un progetto (o da lui collegato) ricaricano solo quel che serve. Durante una build i cambi ai soli file
  ignorati non contano, salvo con Show All Files.

**Trovato e corretto: il nome delle schede con una shell scelta.** `shortKind` trattava ogni scheda con una `shell`
esplicita come aperta dal selettore delle shell, e la chiamava «build 1» invece di «Build Demo.App». Ora vale
solo senza un comando iniziale.

**Verifica.**
- Test: `cargo test` 74 (+12: `.sln` e `.slnx`, progetti SDK, vecchio stile e C++ con filtri, condizioni,
  funzioni di proprietà, import, versioni centrali dei pacchetti, più framework, Show All Files); `vitest` 78/78
  (+12); `svelte-check` 0/0 (294 file).
- **Confronto con MSBuild** su una soluzione reale da 45 progetti, in sola lettura: per ogni progetto gli item da
  `MSBuild.exe -getItem` di Visual Studio 2026, contro la lettura di Orbit.
  - File uguali in 45 progetti su 45.
  - File collegati nello stesso punto della vista: 41 su 41.
  - Riferimenti uguali in 134 liste su 135; manca un riferimento aggiunto dai file di build di un pacchetto
    NuGet, che non si leggono.
  - Il confronto ha trovato tre cose, tutte corrette: un tipo di item personalizzato usato da un target, che non
    va mostrato; un *contentFile* di un pacchetto, da `nuget.g.props`; una proprietà messa dallo sviluppatore nel
    `.csproj.user`, che sceglieva fra un `ProjectReference` e due DLL.
- **Istanza di prova isolata** (identificativo `devtest`) su una repo finta: `Demo.sln` con cartelle di soluzione
  annidate e file della soluzione, un'app console vera, una libreria WPF con file annidati, collegati e `Remove`,
  una libreria vecchio stile, un progetto C++ con filtri, più una `Tools.slnx`.
  - Il menu delle viste elenca le soluzioni; l'albero è quello atteso; *Go to project* evidenzia il progetto.
  - Show All Files: `bin`, `obj` e `x64` letti all'apertura.
  - Run stampa l'uscita dell'app, compilata insieme al file collegato; Build del progetto e della `.slnx` con
    l'MSBuild di Visual Studio.
  - «New file…» in linea; rinominare un file annidato lo lascia annidato; una `Remove` aggiunta da fuori al
    `.csproj` aggiorna il progetto.
  - «Segui il file attivo» apre un file annidato in un progetto chiuso, e uno in «Other files».
  - Cambiando repo il bottone sparisce nelle repo senza soluzioni e la vista torna; al riavvio vista e Show All
    Files si ritrovano.
- **Prestazioni** (build di debug, uno scheletro della soluzione reale: 2.405 file vuoti, progetti veri): soluzione
  in 51 ms, tutti i 45 progetti insieme in 186 ms (2.717 nodi), 41 righe nel DOM.

**Dimensioni.**
- Chunk d'avvio 288,7 KiB (98,4 gzip) contro 285,0: +3,7 KiB per lo stato della vista, la testata e le icone.
- La vista è un chunk a parte da 25,4 KiB (+3,2 di CSS), caricato quando la si apre. `dist/` 2,94 MiB.
- Eseguibile (`tauri build --no-bundle`, senza firma) **6,77 MiB** contro 6,56 della build di controllo della 1.2.0:
  +0,21 MiB per `solution.rs` e il lettore XML.

**Limiti noti.**
- Le condizioni complicate e i riferimenti aggiunti dai file di build dei pacchetti restano fuori: la vista può
  mostrare un file in più, mai uno in meno.
- La configurazione è sempre Debug.
- Nei progetti vecchio stile e C++ i file non si creano né si rinominano dalla vista, perché servirebbe
  modificare il file di progetto: si fa da *Other files* o da Visual Studio.

**Lezioni di collaudo.**
- Correggere un test Rust con uno script Python: nelle stringhe non *raw* `\a` e `\1` diventano caratteri di
  controllo e rompono i percorsi; servono le stringhe `r'''…'''`.
- Modificare `terminals.svelte.ts` con la dev aperta ricrea il modulo (HMR) e le schede impazziscono: va
  riavviata l'istanza di prova, come già annotato.
- Le chip della barra delle repo hanno una copia invisibile (la riga di misura): per cliccarle bisogna cercare
  nella striscia visibile.

---

## Versione 1.3.0

La milestone **M70** in una release: la vista Solution dell'Explorer, come il Solution Explorer di Visual Studio
(cartelle di soluzione, progetti, Dependencies, file annidati, Show All Files, «Other files»), con Build, Rebuild,
Clean e Run dal menu. Titolo "Solutions, like in Visual Studio".

**Preparazione** (2026-10-13, sul PC senza la chiave di firma: la pubblica l'utente dall'altro).
- Versione 1.3.0 nei sei punti, con le due del lockfile a mano; esempi di `New-Release.ps1` aggiornati.
- Build di controllo senza firma (`tauri build --no-bundle`, in una cartella temporanea):
  - eseguibile **6,77 MiB** (6,56 nella 1.2.0);
  - chunk iniziale **288,7 KiB** (98,4 gzip; 285,0 nella 1.2.0);
  - `dist/` 2,94 MiB.
  - Setup e MSI li misura la build firmata: il PC era a corto di memoria, e una seconda build con LTO solo per
    impacchettare non serviva.
- Test: `vitest` 78/78, `cargo test` 74, `svelte-check` 0/0.
- Dall'utente: l'aumento dell'eseguibile va bene così; i commit da qui in poi hanno un'altra email (impostata solo
  nella configurazione locale della repo).

**Per pubblicare**, dal PC con la chiave, in PowerShell 7:
1. `git pull`, poi le note qui sotto in `artifacts/notes-1.3.0.md`;
2. `.\scripts\New-Release.ps1 -Notes .\artifacts\notes-1.3.0.md -Title "Solutions, like in Visual Studio"`, poi il
   setup installato sopra la 1.2.0 e provato, meglio su una repo .NET;
3. di nuovo con `-Publish`;
4. qui: data, tag e misure della build firmata.

Note della release:

```markdown
### Your solutions, like in Visual Studio
- In a repository with Visual Studio solutions (`.sln`, `.slnx`), the new **⇄ button** in the Explorer header
  switches between the folders on disk and a solution, shown the way Visual Studio's **Solution Explorer**
  shows it:
  - solution folders and projects (C#, VB, F#, C++);
  - a **Dependencies** node with frameworks, packages and project references;
  - nested files (`App.xaml.cs` under `App.xaml`), linked files and C++ filters.
- **Show All Files** adds, in gray, what the projects leave out, like `bin`, `obj` and files that aren't in
  the project.
- Whatever isn't part of the solution stays one click away under **Other files**.
- The view follows the active file, shows your git changes and updates by itself when a project file changes.
  Orbit remembers it for each repository.
- Orbit reads the solution and project files on its own, without running MSBuild.

### Build and run from the tree
- Right-click the solution or a project to **Build**, **Rebuild** or **Clean** it, or **Run** an executable
  project, in a terminal tab.
- Orbit uses Visual Studio's MSBuild when it's installed, so C++ projects build too; otherwise it uses
  `dotnet`.
```

**Rilasciato in v1.3.0** il 2026-10-13 sera (19:42 UTC): "Orbit v1.3.0 — Solutions, like in Visual Studio", tag
`v1.3.0` sul commit `9a45400`, pubblicata dall'utente dal PC della chiave con `New-Release.ps1 -Publish`.
- Prima una build firmata di prova, controllata: firme valide, `latest.json` con le note qui sopra.
  - Poi l'utente ha scelto di pubblicare subito e di provare la vista Solution dopo l'aggiornamento dall'app, come
    per la 1.2.0, senza installare a mano il setup.
- Build firmata pubblicata:
  - eseguibile **6,82 MiB** (6,61 nella 1.2.0);
  - setup NSIS **3,26 MiB** (3,18), MSI **4,04 MiB** (3,93);
  - chunk iniziale **289,0 KiB**, `dist/` 2,94 MiB.
- Controlli dopo la pubblicazione:
  - i cinque file su GitHub hanno gli stessi SHA-256 di quelli locali;
  - l'indirizzo degli aggiornamenti serve il `latest.json` firmato: 1.3.0, con setup e MSI e le loro firme;
  - firme valide per la chiave di `tauri.conf.json`.

---

## Milestone 71 — rilasci da GitHub Actions: si pubblica da qualunque PC

Richiesta dell'utente (2026-10-13), con un prompt preparato sul PC di lavoro. Si poteva pubblicare solo dal PC
di casa, l'unico con la chiave di firma. Le prossime release passano da GitHub Actions, con la chiave nei secret
di GitHub: così si pubblica da qualunque PC, o dal browser, e la chiave non va copiata sui PC di lavoro. Lo script
locale resta come alternativa.

Le scelte:
- i secret in un **environment `release`**, valido solo per `main`, che aspetta l'approvazione del maintainer
  prima di ogni esecuzione. Proposto fra tre strade: environment con approvazione, environment senza
  approvazione, secret del repository;
- il workflow riusa `New-Release.ps1` com'è: stessi controlli, stessi artefatti, stesso `latest.json`;
- si lancia solo a mano (`workflow_dispatch`), dal sito o con `gh workflow run`, mai da una pull request: il repo
  è pubblico;
- le note vengono dal blocco markdown della sezione «## Versione X.Y.Z» di NOTES.md, con la versione di
  `tauri.conf.json`;
- prima di tutto il **backup** di chiave e password fuori dal PC, perché i secret di GitHub non si rileggono.

**Cosa c'è.**
- `.github/workflows/release.yml`:
  - input `title` e `publish`; con `publish` spento è una prova a secco;
  - gira su `windows-latest`, con il permesso `contents: write` solo nel job;
  - checkout con tutta la storia, perché lo script controlla che il commit sia su GitHub. Le credenziali non
    restano salvate: sul repo pubblico il `git fetch` dello script funziona senza token;
  - Node 24 con `npm ci`;
  - Rust stable installato con `rustup`, senza azioni di terzi;
  - cache di cargo: i download e `src-tauri/target`, senza i bundle;
  - solo azioni di GitHub, fissate per commit e uscite da almeno due settimane, perché il job vede la chiave:
    `checkout` 7.0.1, `setup-node` 7.0.0, `cache` 6.1.0, `upload-artifact` 7.0.1. La 7.1.0 di `setup-node` aveva
    5 giorni, la 7.0.2 di `upload-artifact` 6;
  - le note si estraggono prima di usare i secret: se mancano, l'esecuzione si ferma lì;
  - la chiave passa dal secret a un file temporaneo, dato a `-KeyPath`. Il `Trim` serve perché PowerShell, quando
    passa il file a `gh secret set`, aggiunge un a capo;
  - la password va in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, il token del workflow in `GH_TOKEN`;
  - gli input arrivano dall'ambiente, mai scritti dentro lo script: un titolo non può diventare codice;
  - alla fine: il file della chiave si cancella anche dopo un errore, le misure di eseguibile, setup e MSI vanno
    nel riepilogo, e `artifacts/release` resta come artefatto per 14 giorni.
- `scripts/Get-ReleaseNotes.ps1`:
  - estrae le note della versione e le scrive in UTF-8 con righe LF;
  - si ferma con un errore se la sezione o il blocco mancano o sono vuoti;
  - serve anche in locale: `-Notes (.\scripts\Get-ReleaseNotes.ps1)`.
- L'environment `release`, creato con `gh api`:
  - revisore il maintainer, che può approvare anche le esecuzioni lanciate da lui;
  - rami ammessi: solo `main`;
  - secret `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, caricati dall'utente in una
    finestra di PowerShell: la chiave va dal file a `gh` senza essere mostrata, la password la scrive lui al
    prompt di `gh`.
- Documentazione: `docs/11-release.md` riscritta, con le due strade, le note, il workflow (come si lancia, come si
  approva, cosa fa, dove sta la chiave), backup e cambio della chiave, e la checklist. README, ARCHITECTURE,
  10-development e indice allineati.

**Verifica.**
- `Get-ReleaseNotes.ps1`:
  - sulla 1.3.0 produce un file identico byte per byte alle note pubblicate, e uguale al testo della release;
  - su un repo finto il CRLF diventa LF;
  - sezione mancante, blocco mancante, non chiuso, vuoto o di soli spazi danno ciascuno il suo errore.
- Ogni blocco `run` del workflow passa il parser di PowerShell, e nessuno contiene espressioni `${{ }}`.
- **Prova a secco** sul commit `6466b1e`, esecuzione 38458380440: rispetto alla 1.3.0 pubblicata cambiano solo
  docs, NOTES, workflow e script, non il codice dell'app.
  - Approvata dall'utente; tutti i passi riusciti in 10 min 44 s. La compilazione ha preso 7 min 38 s a cache
    vuota, poi la cache è stata salvata.
  - Confronto con la 1.3.0 pubblicata: stessi nomi di file, stesse chiavi di `latest.json`, stessa versione,
    stesse note, stesse piattaforme e URL. Le firme sono nuove, come deve essere.
  - Firme valide per la chiave pubblica di `tauri.conf.json` (`55F5361AFA695029`): nei secret ci sono la chiave
    giusta e la sua password.
  - Sul runner Rust 1.99.0 (qui 1.92.0): eseguibile **6,70 MiB**, setup **3,23 MiB**, MSI **3,99 MiB**, contro i
    6,82, 3,26 e 4,04 MiB della build locale.

**Da sapere.**
- Claude non può approvare un'esecuzione: il controllo dei permessi di Claude Code blocca l'approvazione di un
  environment protetto. La dà il maintainer, dal sito, da GitHub Mobile o con `gh api`.
- Le release pubblicate dal workflow hanno come autore `github-actions[bot]`.
- Il runner usa l'ultima Rust stabile. Se una versione nuova rompesse la build, si fissa il toolchain nel passo
  «Rust stable».
- La tabella del README ha le misure della build locale della 1.3.0: si aggiornano con la prima release dal
  workflow.

---

## Milestone 72 — scaffale nella vista Solution, sei chat affiancate, editor diviso in righe e colonne

Domande dell'utente (2026-10-23): lo scaffale «non funziona più con le ultime versioni»? Si può migliorare,
anche nell'aspetto e nell'uso? E quanti documenti e quante chat si possono affiancare: si possono superare i
limiti di oggi?

**Lo scaffale.** Nella vista a cartelle funzionava: il suo codice non era cambiato dalla M60 e i test passavano.
Il buco è arrivato con la vista Solution (M70):
- le cartelle nello scaffale sparivano da *Other files*, ma lì la sezione Shelf in fondo non c'era: non si
  ritrovavano più;
- il menu di *Other files* non aveva *Add to shelf…*;
- la vista si ricorda per repo, quindi una repo passata alla soluzione riapriva sempre lì. Due delle tre repo in
  cui l'utente usa lo scaffale hanno una soluzione: quasi certamente è quello che ha visto.

Leggendo il codice sono saltati fuori quattro difetti minori:
1. il contatore della testata contava solo le cartelle, non le regole per nome: con le sole regole di *Shelve
   noise folders* diceva «SHELF 0»;
2. nel picker era rimasta una scritta in italiano («Rimuovi regola»);
3. categorie aperte e sezione chiusa erano stato del componente: tornando all'Explorer da un'altra vista si
   richiudeva tutto;
4. una regola per nome nascondeva anche un FILE con quel nome (una regola «logs» toglieva `scripts/logs`).

**I limiti.**
- Editor: nessun limite di numero, ma solo colonne di uguale larghezza, senza separatori; un gruppo nuovo andava
  sempre in fondo a destra, e l'unica zona di rilascio era una striscia sul bordo destro.
- Chat: al massimo 4 per repo (`MAX_PANES`), per la TUI di Claude che vuole ~480×260 px a riquadro.

Le scelte dell'utente (domande a scelta multipla, tutte sulla mia raccomandazione):
- scaffale: subito le correzioni; le idee per migliorarlo (11, in elenco nella conversazione) le sceglie con
  calma, per un secondo giro;
- chat: fino a 6, con una griglia 3×2;
- editor: lo stesso modello dei riquadri del terminale (righe e colonne, rilascio sui quattro bordi, separatori,
  dimensioni salvate), con un tetto di 6 gruppi.

**Cosa c'è.**
- Scaffale:
  - la sezione in fondo diventa `ShelfSection.svelte`, condivisa da `Explorer` e `SolutionView`, con il suo
    picker per il tasto destro sulle cartelle;
  - *Other files* ha *Add to shelf…* sulle cartelle e *Shelve noise folders* sulla sua riga;
  - `shelfCountIn` conta cartelle e regole; `isHiddenIn(rel, map, byName, isDir)` applica le regole per nome
    alle sole cartelle (per un file si saltano il suo nome, non le cartelle che lo contengono);
  - `shelfUi` (cosa è aperto) vive nel modulo: sopravvive al rimontaggio della vista;
  - `NOISE` e `shelveNoise` passano nel modulo, per le due viste;
  - la scritta del picker in inglese.
- `terminalLayout.ts` diventa `paneLayout.ts`, perché ora serve anche all'editor. Ci passano, puri e testati:
  - `PaneSizes`, `shapeOf` e `sizesFor` (prima in `terminals.svelte.ts`);
  - `paneGeometry`: i rettangoli dei riquadri e dei separatori, prima calcolati dentro `TerminalPanel`;
  - `resizePanes`: il trascinamento di un separatore, con un minimo in px;
  - `reconcile`: una disposizione allineata ai riquadri che esistono (via i mancanti e i doppioni, in coda come
    colonne quelli senza posto);
  - `validSizes`: dimensioni lette da un file, accettate solo se hanno la forma giusta;
  - `insertPane` prende il massimo come argomento (l'editor ha il suo).
- Chat: `MAX_PANES` passa a 6. `arrangeAuto` per 5–6 chat prova anche la griglia a tre colonne, che a parità di
  punteggio viene prima di tutto: su uno schermo 4K al 125% (pannello massimizzato ~3060×1600 px) sei colonne
  da 510 px «ci stanno», ma 3×2 dà a ogni chat 1020×800. In un pannello stretto vince la griglia a due colonne
  di tre righe.
- Editor:
  - `workspace.groupLayout` (id dei gruppi per colonna) e `workspace.groupSizes`; `groupLayout()` li legge
    allineati ai gruppi con `reconcile`, così un percorso del codice che dimentica la disposizione non può
    nascondere un gruppo;
  - `EditorArea` posiziona i gruppi in assoluto da `paneGeometry`, con 1 px fra l'uno e l'altro che lascia
    vedere la linea (la geometria si calcola su una superficie più grande di 2 px, così lo spazio del bordo
    esterno resta fuori vista);
  - separatori da 7 px di presa, accento all'hover; quello verticale sta sopra all'incrocio con uno orizzontale;
    mai sotto 160 px;
  - rilascio di una scheda sul contenuto di un gruppo (`dropZone`, entro un terzo dal bordo): sul bordo un
    gruppo nuovo da quel lato, al centro la scheda va in quel gruppo. Il segno compare solo dove il rilascio fa
    qualcosa (`dropFor`). L'unica scheda di un gruppo, rilasciata sul bordo di un altro, sposta il gruppo intero.
    A 6 gruppi il rilascio sul bordo diventa «nel gruppo»;
  - via la striscia «Split» sul bordo destro;
  - *Open to the side* apre la colonna a destra del gruppo attivo (prima: in fondo). A 6 gruppi apre nel gruppo
    che segue quello attivo, con un avviso;
  - chiudendo un gruppo diventa attivo il vicino nella disposizione, non nell'elenco;
  - con l'editor diviso la scheda attiva dei gruppi non attivi è più tenue: si vede dove si sta lavorando;
  - sessione: `groupLayout` (indici dei gruppi salvati per colonna) e `groupSizes`. Una sessione di prima, o con
    una disposizione che non torna, dà una colonna per gruppo, come prima.
- Testo che Orbit scrive in CLAUDE.md: «fino a 6» chat, e l'editor in righe e colonne.
- Docs: 01, 02, 03, 04, 07, 10, ARCHITECTURE e README. In 10-development una regola in più per l'istanza di prova
  (sotto, «Da sapere»).

**Verifica.**
- `vitest` 89/89 (78 nella 1.3.0): 11 test nuovi fra scaffale (file con il nome di una regola, contatore) e
  `paneLayout` (massimo per chiamata, 5–6 chat, geometria, separatori, `reconcile`, `validSizes`).
  `svelte-check` 0/0, `cargo test` 74 (il Rust non è cambiato).
- Collaudo nell'app vera, su un'istanza di prova isolata e una repo finta (una soluzione con due progetti SDK,
  cartelle `tools`, `docs`, `node_modules`, una cartella `src/logs` e un file `scripts/logs`), con clic e
  trascinamenti veri (eventi `Input` di CDP):
  - vista a cartelle: *Shelve noise folders* → «Shelf 4»; `tools` per percorso; regola «logs» → sparisce
    `src/logs`, resta il file `scripts/logs`; il picker dice «Remove the rule for “logs”»; categorie e cartella
    aperte restano tali dopo un giro su Git;
  - vista Solution: la sezione Shelf c'è, *Other files* ha *Add to shelf…*, `docs` messa e tolta dallo scaffale
    dalla sezione in fondo; `.orbit/shelf.json` giusto su disco;
  - chat: a finestra massimizzata (3072×1680 px logici) sei terminali in 3×2; il menu Split non propone di
    affiancarne un settimo;
  - editor: rilascio sul bordo destro, inferiore e superiore → griglia 2×2; separatori verticale e orizzontali;
    l'unica scheda di un gruppo sul bordo sinistro di un altro sposta il gruppo; *Open to the side* fino a 6
    gruppi, poi l'avviso e il file nel gruppo seguente; chiusura di un gruppo → attivo il vicino;
  - dopo una chiusura dalla ✕ e un nuovo avvio tornano disposizione, dimensioni e gruppo attivo dell'editor, e le
    7 schede del terminale con le 6 chat affiancate (sveglie quelle a vista, dormiente la settima).

**Misure.** Chunk iniziale **293,1 KiB** (99,4 gzip), contro 289,0 (98,2) della stessa build prima delle
modifiche; `dist/` 2,94 MiB, invariato. L'eseguibile non cambia: il Rust è lo stesso.

**Da sapere.**
- Uccidere l'istanza di prova invece di chiuderla dalla ✕ non lascia nulla da ripristinare: l'avvio seguente ha
  una chiave di finestra nuova, ritrova l'editor attraverso il puntatore all'ultima cartella (`load_state` senza
  chiave) ma non i terminali, che stanno sotto la chiave vecchia. Durante il collaudo sembrava che le chat non
  tornassero; chiudendo dalla ✕ tornano. Aggiunto alle regole di `docs/10-development.md`.
- Importando dalla console un modulo di stato modificato durante la sessione di Vite bisogna usare l'URL con
  `?t=` che l'app ha caricato (lo dice già 10-development); l'URL nudo crea una seconda copia vuota.
- Resta da decidere quali idee per lo scaffale fare (regole valide per tutte le repo, categorie condivise,
  rinominare e colorare una categoria, pattern, esclusione da ricerca e Quick Open, trascinamento sullo
  scaffale, interruttore per vederle in grigio al loro posto, avviso con Undo, nodi veri al posto del
  mini-albero, colore per categoria, separatore fra albero e scaffale).
- La tabella Footprint del README resta quella della 1.3.0: si aggiorna con la release.

---

## Milestone 73 — lo scaffale, secondo giro: regole per tutte le repo, nodi veri, categorie, Undo

Dopo la M72 l'utente ha chiesto di far evolvere lo scaffale. Il metodo, chiesto da lui: gli presento i miglioramenti
possibili, spiegati, e lui sceglie se farli e come, con una domanda a scelta multipla per ciascuno.

**Il punto di partenza.** Nelle sue repo mette a mano sempre le stesse cartelle (`.git`, `.claude`, `.idea`, `.orbit`,
`.vs`, `.run`), in una categoria che si chiama ogni volta in modo diverso (settings, Settings, config). Le cartelle
dello scaffale si aprivano in un mini-albero senza menu né colori git; una regola per nome diceva solo «all
folders»; le categorie non si potevano rinominare.

**Le scelte** (la mia raccomandazione su tutte, tranne la 1, che è un'idea sua):
1. Scaffale **sempre visibile**, anche vuoto, con una **⚙** che apre una pagina **Shelf** nelle Impostazioni: la
   funzione si fa scoprire da chi non la conosce. Lì le regole valide in ogni repo; in più una casella «In every
   repository» nel picker. Vuoto e aperto: testata e una riga d'aiuto.
2. «Shelve dot-folders»: una regola `.*` per tutte le repo, in **Config**.
3. Pattern `*` e `?` nelle regole per nome.
4. Categorie: rinomina, elimina, colore.
5. Le voci come nodi veri dell'albero (riga e menu dell'Explorer).
6. Le regole mostrano cosa prendono («bin — 12 folders») e si aprono sull'elenco.
7. Pallino git su categoria, voce e regola, e sulla testata a sezione chiusa.
8. Separatore trascinabile fra albero e scaffale.
9. Trascinare una cartella dall'albero sullo scaffale (solo verso lo scaffale).
10. Avviso con **Undo** dopo ogni azione.
11. Per categoria, «Hide from search and Quick Open».
12. Anche i file, per percorso e per pattern.
13. «Shelve noise folders» globale, in **Generated** (prima «Generato», in italiano, e solo nella repo).
14. L'occhio (scelto prima): le voci dello scaffale al loro posto nell'albero, in grigio, nella testata dello
    scaffale.
- Release: prima la prova l'utente in dev, poi decide.

**Come è fatto.**
- **Il modello** (`shelfRules.ts`, puro): voci per percorso (cartelle o file) e regole per nome per cartelle
  (`folders`) o per file (`files`), nomi esatti o pattern; `compileShelf` le compila una volta (insieme di nomi
  esatti più espressioni regolari dai pattern). Una regola per cartelle nasconde le cartelle e il loro contenuto,
  mai un file con lo stesso nome, e viceversa. Più le operazioni sulle categorie (rinomina senza doppioni,
  elimina, pulizia dei dati letti da file).
- **Lo stato** (`shelf.svelte.ts`):
  - repo in `.orbit/shelf.json` (`shelved`, `byName` come prima, più `files`: le versioni precedenti continuano a
    leggerlo);
  - globali su questo PC (`localStorage` `orbit.shelf`): le regole per tutte le repo e i metadati delle
    categorie (colore, esclusione dalla ricerca), globali perché «Config» è la stessa ovunque;
  - `orbit.shelfUi`: categorie e regole aperte, altezza, occhio, ricordati anche al riavvio;
  - le regole compilate si rifanno quando cresce un contatore di versione, non a ogni riga dell'albero;
  - ogni azione fotografa lo stato e mostra l'avviso con Undo (che lo rimette com'era, repo e globali); gli
    avvisi dello scaffale si sostituiscono invece di accodarsi (`notify` con `key`, M73).
- **Rust**: `shelf_find(root, folders, files)` trova cosa prende ogni regola in una passata, senza entrare in
  ciò che trova, nelle cartelle ignorate da git, in `.git`, `node_modules`, `target`, `dist`; al massimo 500 voci
  per regola. Lo stesso confronto dei pattern del frontend (`glob_match`, senza il crate `regex`). Si rilancia
  quando cambiano le regole e dopo i cambi su disco.
- **Righe e menu condivisi**: `TreeRow.svelte` e `treeMenu.ts`, usati da Explorer, «Other files» e scaffale (prima
  le prime due avevano ciascuna la sua copia; il mini-albero `MiniTree.svelte` è sparito). `explorer.nodeAt` e
  `ensureNode` danno allo scaffale i nodi veri: le cartelle sopra una voce si leggono senza aprirle, e
  aggiornamenti dal watcher, espansione in sessione, rinomina e git vengono gratis.
- `edit.where`: con l'occhio la stessa voce sta nell'albero e nello scaffale; la casella del nome compare solo
  dove è partito il comando.
- **Il trascinamento** (`shelfDrag.svelte.ts`): a puntatore come le schede; zone di rilascio `data-shelf-drop`
  (una categoria, o la testata che apre il picker); il click che chiude un trascinamento non apre la voce.
- **Il picker**: «This folder» / «All folders matching» con il pattern, «In every repository», categorie con
  colore, nuova categoria, rimuovi. Anche per i file.
- **Impostazioni → Shelf** (`SettingsShelf.svelte`): regole per tutte le repo (aggiungi, togli, categorie),
  categorie (colore, esclusione dalla ricerca, elimina) e l'occhio; la riga «Rules for every repository» resta
  per la ricerca nelle Impostazioni.
- **Ricerca e Quick Open** saltano le voci delle categorie escluse (filtro sul frontend, dopo il giro).
- Finestra leggera: niente scaffale né «Add to shelf…», perché non scrive nulla nella cartella.
- Il testo che Orbit scrive in CLAUDE.md descrive i nuovi campi di `shelf.json`.

**Peso.** Con tutto nel chunk d'avvio era 313,7 KiB (293,1 nella M72). La testata della sezione resta all'avvio;
il contenuto (`ShelfBody.svelte`) e il picker si caricano quando servono, come le altre viste. Risultato:
**301,0 KiB** (102,5 gzip), +7,9 KiB; `dist/` 2,98 MiB.

**Verifica.**
- `vitest` 98/98 (89 nella M72): il modello dello scaffale riscritto, 21 test (nomi e pattern, regole per cartelle e
  per file, `.*`, ambiti insieme, categorie, pulizia dei dati). `cargo test` 76 (+2: `glob_match`, `shelf_walk`).
  `svelte-check` 0/0.
- Collaudo nell'app vera, su un'istanza di prova isolata e una repo finta (una soluzione con due progetti,
  cartelle col punto, `bin`/`obj` ignorate da git, un `*.DotSettings.user`, una modifica non committata), con clic
  e trascinamenti veri:
  - scaffale vuoto con la riga d'aiuto; *Shelve dot-folders* → spariscono le 5 cartelle col punto, «.* — 5 folders
    · all repositories», l'elenco si apre e `.vs` si apre come nodo vero; *Shelve noise folders* e Undo; un
    avviso solo, l'ultimo;
  - `*.user` dal picker («All files matching») in una categoria nuova; `tools` trascinata sulla testata → picker;
    `scripts` trascinata su una categoria;
  - colore, «Hide from search» e rinomina dal menu della categoria; ricerca di «Write-Host» e Quick Open senza i file
    di Utility, e di nuovo con, togliendo l'esclusione;
  - l'occhio: voci in grigio al loro posto, col pallino del colore della categoria; la rinomina partita dallo
    scaffale apre la casella solo lì;
  - separatore: 163 → 524 px, ricordato; doppio clic → automatico;
  - la ⚙ apre Impostazioni → Shelf con regole e categorie;
  - una regola della repo portata in tutte le repo e indietro;
  - dopo una chiusura dalla ✕ e un nuovo avvio tornano voci, regole globali, colori, categorie aperte;
  - vista Solution: scaffale in fondo, occhio su «Other files», trascinamento da lì e Undo;
  - dopo la divisione del componente, di nuovo picker, trascinamento e Undo.

**Da sapere.**
- Le regole globali e i colori stanno su questo PC: sull'altro PC si rifanno una volta.
- La regola `.*` prende anche `.github`: per vederla c'è l'occhio.
- Le regole «Generato» create prima della M73 restano nelle repo che le hanno: si rinominano in «Generated» dal
  menu della categoria.
- La tabella Footprint del README resta quella della 1.3.0: si aggiorna con la release.

---

## Versione 1.4.0

Le milestone **M72** e **M73** in una release: lo scaffale nella vista Solution e poi rifatto (regole per tutte le
repo, file e pattern, nodi veri dell'albero, categorie, Undo), l'editor diviso in righe e colonne e fino a sei chat
affiancate. Titolo "A shelf for every repository".

**Preparazione** (2026-10-23, da questo PC: la prima release pubblicata con il workflow Release di GitHub Actions,
M71).
- Versione 1.4.0 nei sei punti, con le due del lockfile a mano; esempi di `New-Release.ps1` aggiornati.
- Test: `vitest` 98/98, `cargo test` 76, `svelte-check` 0/0; collaudo nell'app vera per M72 e M73 (vedi le
  milestone).
- Chunk iniziale **301,0 KiB** (102,5 gzip; 289,0 nella 1.3.0), `dist/` 2,98 MiB. Eseguibile, setup e MSI li misura
  la build firmata del workflow.
- Scelte dell'utente: il titolo; pubblicazione diretta, senza prova a secco (il workflow fa gli stessi controlli e
  ha già funzionato nella M71); la 1.4.0 la prova aggiornando dall'app, come la 1.2.0 e la 1.3.0.

Note della release:

```markdown
### A shelf for every repository
- The **Shelf** at the bottom of the Explorer is always there now, with a ⚙ that opens its own page in
  **Settings → Shelf**.
- Set aside a folder or a file, or a **rule**: every folder or file matching a name or a pattern, like `bin`,
  `*.Tests`, `.*` or `*.DotSettings.user`. It applies to this repository or to **every repository** you open.
- **Shelve dot-folders** puts `.git`, `.vs`, `.idea` and the like away in one click, in every repository;
  **Shelve noise folders** does it for `node_modules`, `target` and `dist`.
- Shelved items are real tree items: git colors, the full right-click menu, and they remember what you opened.
  A rule shows what it takes (*bin — 12 folders*) and opens on that list.
- The **eye** shows shelved items back in the tree, dimmed. Categories get colors, can be renamed or deleted,
  and can stay out of search and Quick Open.
- Drag a folder from the tree onto a category, resize the shelf from its top edge, and undo any change from its
  notice. A dot tells you when something you shelved has changed.
- The Shelf now works in the Solution view too.

### Split the editor your way
- Drop a tab on any edge of an editor group (left, right, top or bottom) to open a new group there, or in the
  middle to move it. Up to six groups, with draggable splitters; the layout comes back when you reopen Orbit.

### Six chats side by side
- Up to **six** Claude chats or terminals side by side per repository, in a 3×2 grid on a wide screen.
```

**Rilasciato in v1.4.0** il 2026-10-23 (13:14 UTC): "Orbit v1.4.0 — A shelf for every repository", tag `v1.4.0` sul
commit `18f8c36`. È la prima release pubblicata dal workflow Release di GitHub Actions (M71), esecuzione
39957992701: approvata dall'utente, 8 min 49 s dall'approvazione alla pubblicazione; autore `github-actions[bot]`.
- Build firmata (sul runner, Rust stabile):
  - eseguibile **6,73 MiB** (6,70 nella prova a secco della 1.3.0 sullo stesso runner; 6,82 la 1.3.0 firmata in
    locale con Rust 1.92);
  - setup NSIS **3,26 MiB** (3,23 nella prova a secco), MSI **4,01 MiB** (3,99);
  - chunk iniziale 301,0 KiB, `dist/` 2,98 MiB.
- Controlli dopo la pubblicazione:
  - l'indirizzo degli aggiornamenti serve il `latest.json` della 1.4.0, con setup e MSI e le loro firme;
  - le firme di setup e MSI (e la firma globale del commento) sono valide per la chiave di `tauri.conf.json`,
    verificate a mano (Ed25519 su BLAKE2b-512, come minisign).
- README: il Footprint ora ha le misure della 1.4.0 firmata (era quello della 1.3.0, M71).

---

## Milestone 74 — notifiche: errori che restano, storico nella 🔔, chat in attesa in un avviso solo

Richiesta dell'utente (2026-10-23): «possiamo curare meglio le notifiche di orbit?». Come per la M73: i miglioramenti
spiegati, poi una domanda per ciascuno, se farlo e come.

**Com'erano.** Avvisi in basso a destra di quattro tipi, da 41 punti del codice, che sparivano tutti dopo ~2,6 s,
errori compresi: un «Save failed: …» col testo del sistema non si faceva in tempo a leggerlo e non si ritrovava più.
Ogni chat in attesa aveva il suo avviso fisso, e con più chat si impilavano. L'icona «info» era quella di un commit.
Un messaggio in italiano nell'interfaccia: «git push → eseguito nel terminale».

**Le scelte dell'utente:**
- **sì**: errori fissi con «Copy» e pausa col mouse sopra; nuovo aspetto (icona per tipo, messaggio e dettaglio,
  barra del tempo); storico nella 🔔 della barra di stato; chat in attesa in un avviso solo; un suono solo con
  Orbit dietro; una pagina **Notifications** nelle Impostazioni con **Do not disturb**;
- **no**: spostare gli avvisi (restano in basso a destra), meno rumore (le conferme restano avvisi), notifiche di
  Windows (niente `tauri-plugin-notification`);
- a lavoro in corso, guardando la prova: «non mi piace che le notifiche siano tutte di dimensione diversa»: ora
  sono tutte larghe 360 px.

**Cosa c'è.**
- `toast.svelte.ts`:
  - `notify(message, kind, ms, { detail, action, key })`: il dettaglio tecnico va sotto il messaggio. Gli errori
    restano finché li chiudi e hanno «Copy» (messaggio e dettaglio negli appunti), gli altri spariscono dopo
    `ms`;
  - la pausa: un timer per avviso con il tempo che resta, fermato e ripreso da `pauseToast`/`resumeToast`;
  - `notifyAttention` con la stessa `key` aggiorna l'avviso che c'è (testo, elenco) invece di ignorarlo, e prende
    `items`, un elenco cliccabile;
  - `notices`: le ultime 50, per la 🔔. Il numero conta solo errori e chat in attesa, così le conferme («Name
    copied») non lo gonfiano; nello storico restano solo le azioni che restano valide (andare a una chat, il
    dialogo dell'aggiornamento), mai un Undo, che annullerebbe cose fatte dopo.
- `Toaster.svelte`: icona per tipo (le nuove `info` e `alert`, `check`, ✦ per Claude), messaggio e dettaglio (al
  massimo tre righe), azioni a destra, ✕ su quelli fissi, barra del tempo (animazione CSS, ferma col mouse sopra),
  larghezza fissa. Con Do not disturb mostra solo gli errori. L'avviso delle chat ha un fondo pieno: era
  trasparente e sopra le Impostazioni ci si leggeva sotto.
- La 🔔 nella barra di stato (`StatusBar`), con le non lette (rosse se c'è un errore); l'elenco è
  `NoticeCenter.svelte`, caricato quando si apre: ora, tipo, messaggio, dettaglio, «Copy» sugli errori,
  clic su quelle che portano da qualche parte, Do not disturb e «Clear». Sta sopra gli avvisi, così uno nuovo non
  lo copre.
- Chat in attesa (`terminals.svelte.ts`): `syncWaitingToast` tiene un avviso solo, «Claude in repo › chat is
  waiting for you» con una chat, «N chats are waiting for you» con l'elenco da due in su; si aggiorna quando una
  chat si mette in attesa, quando la guardi o la chiudi. Nello storico una riga per chat. Con Orbit dietro, un
  suono (`lib/chime.ts`: due note morbide, re e la, da Web Audio, nessun file audio; al massimo uno ogni 1,5 s).
- Do not disturb (`settings.dnd`): solo gli errori come avvisi, niente suono né lampeggio in taskbar; restano
  pallini, pillola Waiting e «●» nel titolo, e l'avviso delle chat torna quando lo si spegne.
- Impostazioni → **Notifications**: «Notify when a chat is waiting» (spostata da Claude, dove resta una riga che
  rimanda lì), «Play a sound», «Do not disturb».
- Gli errori con il testo del sistema attaccato (`: ${e}`) ora hanno un messaggio in chiaro e il dettaglio a parte
  («Couldn't save “x”» + «Access is denied…»); «git push is running in the terminal» in inglese.

**L'aspetto, secondo giro.** L'utente: «cerchiamo di curare meglio l'aspetto delle notifiche». Questa volta le
proposte le ho disegnate nella finestra di prova (un pannello sovrapposto, solo visivo, con i colori del tema),
accanto agli avvisi veri, in due varianti per il tempo che resta (anello attorno all'icona, barra in fondo).
- Scelte, tutte sulla mia raccomandazione: icona in un cerchio tinto e niente striscia a sinistra; anello del
  tempo; Copy e Undo come pillole e una ✕ piccola; le chat in attesa col colore della loro scheda; elenco della 🔔
  per giorno, con ora relativa e pallino sulle non lette; avvisi che scivolano e si ricompattano; titolo in
  peso medio.
- E un richiamo dell'utente, guardando l'anteprima: «è importante anche la simmetria degli elementi», che lì non
  era precisa (icona in alto e Copy centrato, pillole a distanze diverse dal bordo, pallini e frecce
  disallineati). Da qui la griglia unica: `| 12 | icona 28 | 10 | messaggio | pillole | 10 | ✕ 28 | 12 |`, con
  la colonna della ✕ sempre presente (sugli avvisi a tempo la ✕ compare col mouse) e tutto centrato sulla riga
  del messaggio; l'anello sul bordo del cerchio, non fuori, così il cerchio ha lo stesso diametro in tutti gli
  avvisi. Lo stesso per l'elenco della 🔔 (`| 12 | icona 24 | 10 | messaggio | ora |`), con il pallino delle
  non lette sul bordo dell'icona invece che in un margine.
- Misurato, non a occhio, con le posizioni degli elementi nella finestra di prova: in ogni avviso cerchio,
  messaggio, pillola e ✕ hanno lo stesso centro verticale; il cerchio sta a 13 px dal bordo e il testo a 51 in
  tutti; Copy e Undo finiscono entrambe a 51 px dal bordo destro; ✕ e frecce dell'elenco hanno il centro a 26,8
  px dal bordo destro, come il centro dell'icona dal sinistro; i pallini delle chat partono a 51 px, sul filo del
  messaggio. Nell'elenco della 🔔 testata, giorni e icone a 13 px, testo a 47, ora e Copy che finiscono a 13 px dal
  bordo destro.
- Poi l'utente: «la x deve essere più semplice da cliccare». Era un bersaglio di 20×20 px con un'icona da 12: ora
  è un cerchio di 28×28 (icona da 13, sfondo tondo al passaggio), lo stesso diametro dell'icona dall'altro lato.
  Le misure qui sopra sono già con la ✕ nuova (prima: pillole a 43 px, ✕ a 22,8).
- Le chat in attesa ora si chiamano per nome, con la repo come dettaglio («Claude 2 is waiting for you» e sotto
  «demo-repo»): prima «Claude in demo-repo › Claude 2 is waiting for you» andava a capo.
- Il pannello dell'anteprima non è codice di Orbit: è sparito al primo ricaricamento della pagina.

**Peso.** Chunk iniziale **308,0 KiB** (105,1 gzip): +5,0 sulla 1.4.0 col primo giro, +2,0 col secondo; `dist/`
2,99 MiB. Nessuna dipendenza nuova, il Rust non cambia.

**Verifica.**
- `svelte-check` 0/0, `vitest` 98/98 (nessuna logica pura nuova da testare a parte).
- Nell'istanza di prova, con eventi veri dove serve:
  - errore con dettaglio, «Copy» (negli appunti messaggio e dettaglio, il pulsante dice «Copied»), ✕; conferma con
    Undo e barra del tempo; info con la sua icona; tutti 360 px, alti 38 quelli di una riga, 56 l'errore;
  - la pausa: un avviso da 3 s, col mouse sopra, c'è ancora dopo 6 s e sparisce ~2,7 s dopo che il mouse esce.
    Nella prova il mouse simulato «usciva» da solo dopo ~3,7 s: Chromium, dopo un cambio della pagina, ripete il
    movimento all'ultima posizione vera del puntatore di sistema, che era altrove; ripetendo il passaggio sopra
    l'avviso, come fa un puntatore fermo lì, regge;
  - tre chat in attesa → un avviso «3 chats are waiting for you» con l'elenco; clic su una → «2 chats»; tre righe
    nello storico;
  - la 🔔: numero delle non lette (rosso con un errore), elenco, Do not disturb dalla testata (via l'avviso delle
    chat, passa un errore nuovo, la campanella barrata), spento → l'avviso delle chat torna;
  - la pagina Notifications; il suono parte senza errori (Web Audio).

---

## Versione 1.5.0

La milestone **M74** in una release: le notifiche, cioè errori che restano con «Copy», dettaglio separato, pausa
col mouse, storico nella 🔔 con Do not disturb, chat in attesa in un avviso solo con il suono, e il nuovo aspetto
su una griglia unica. Titolo "Notifications you can read".

**Preparazione** (2026-10-23, da questo PC, con il workflow Release di GitHub Actions come la 1.4.0).
- Versione 1.5.0 nei sei punti, con le due del lockfile a mano; esempi di `New-Release.ps1` aggiornati.
- Test: `vitest` 98/98, `cargo test` 76, `svelte-check` 0/0; collaudo nell'istanza di prova (vedi la M74).
- Chunk iniziale **308,0 KiB** (105,1 gzip; 301,0 nella 1.4.0). Il Rust non cambia dalla 1.4.0: eseguibile, setup
  e MSI li misura la build firmata del workflow.
- Scelte dell'utente: il titolo; pubblicazione diretta, come per la 1.4.0.

Note della release:

```markdown
### Notifications you can read
- Every notice has a clear message, with the technical detail below it. **Errors stay until you close them**,
  with **Copy** to take their text along.
- A notice pauses while your mouse is over it, and a ring around its icon shows the time it has left.
- A new look: the icon in a tinted circle, buttons as pills, a bigger ✕, all lined up on one grid. Notices slide
  in and close up smoothly.

### Never miss one
- The **🔔** in the status bar keeps your last 50 notifications, by day, with a count of what you missed and a
  dot on the new ones.
- **Do not disturb**, from the 🔔 or from Settings → Notifications, keeps only errors on screen, with no sound;
  everything still goes to the list.

### Chats waiting for you
- With more Claude chats waiting, **one** notice lists them all, each in the color of its tab: click one to go
  there.
- A short, soft chime when a chat is waiting and Orbit is in the background.
```

**Rilasciato in v1.5.0** il 2026-10-23 (15:11 UTC): "Orbit v1.5.0 — Notifications you can read", tag `v1.5.0` sul
commit `07a9890`, dal workflow Release (esecuzione 39974713380): approvata dall'utente, 5 min dall'approvazione
alla pubblicazione; autore `github-actions[bot]`.
- Build firmata (sul runner, Rust stabile):
  - eseguibile **6,74 MiB** (6,73 nella 1.4.0: il Rust non cambia);
  - setup NSIS **3,26 MiB** (uguale), MSI **4,02 MiB** (4,01);
  - chunk iniziale 308,0 KiB (105 gzip), `dist/` 2,99 MiB.
- Controlli dopo la pubblicazione:
  - l'indirizzo degli aggiornamenti serve il `latest.json` della 1.5.0 (uguale all'asset della release), con setup e
    MSI e le loro firme, indirizzi su `v1.5.0`;
  - le firme di setup e MSI (e la firma globale del commento) sono valide per la chiave `55F5361AFA695029` di
    `tauri.conf.json`, verificate a mano (Ed25519 su BLAKE2b-512, come minisign).
- README: il Footprint ha il chunk iniziale della 1.5.0 (~308 KB); binario, setup e MSI arrotondati non cambiano.

---

## Ambiente di sviluppo verificato
- Node 24, npm 11, Rust 1.92 (host `x86_64-pc-windows-msvc`).
- MSVC C++ tools + Windows SDK 26100 (Visual Studio Community 2026).
- WebView2 runtime 148 presente.
- Release su GitHub Actions (M71): `windows-latest`, Node 24, Rust stable (1.99.0 alla prima prova, 2026-10-13).
- Dev su **Windows**; il codice è scritto per essere cross-platform (vedi milestone
  finale per la nota sul build Linux/macOS, non testabile direttamente da qui).
