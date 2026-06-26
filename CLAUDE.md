<!-- orbit:run-config -->
## Configurazioni di esecuzione (Orbit)

Orbit (l'IDE) mostra un menu **Esegui ▶** con i comandi definiti in `.orbit/run.json`.
Per aggiungere un comando lanciabile con un click, aggiungi una voce a quel file:

```json
{
  "configurations": [
    { "name": "Dev", "command": "npm run dev", "cwd": "." },
    { "name": "Test", "command": "cargo test", "cwd": "src-tauri" }
  ]
}
```

- `name`: etichetta mostrata nel menu Esegui.
- `command`: comando shell, eseguito in una tab del terminale di Orbit.
- `cwd` (opzionale): cartella di lavoro relativa alla radice del progetto (default ".").

Quando l'utente chiede un modo per avviare/buildare/testare qualcosa, aggiungi o aggiorna
una voce in `.orbit/run.json`: Orbit ricarica il menu automaticamente.

<!-- orbit:claude-config -->
## Orbit — IDE e integrazione Claude

Stai lavorando dentro **Orbit**, un IDE leggero (Tauri + Svelte) companion di Claude Code. Questa
sezione — generata da Orbit (menu Claude → *Update CLAUDE.md for Claude*) — riassume cosa offre
l'IDE e come configurarlo.

### Menu Claude
Apre `claude` nella radice del progetto e offre: *scorciatoie* (prompt fissi) e *wrapper* (template
con segnaposto `{{input}}`: scrivi il testo, lo componi e lo **copi negli appunti**). Tutto vive in
`.orbit/claude.json`. (Le **sessioni recenti** si riprendono ora dalla vista **Attività**, non più da qui.)

```json
{
  "command": "claude",
  "args": "",
  "shortcuts": [
    { "name": "Aggiorna documentazione", "icon": "book-open", "prompt": "Rileggi il progetto e aggiorna README e docs/…" }
  ],
  "wrappers": [
    { "name": "Revisione codice", "icon": "search", "template": "Rivedi e segnala bug e migliorie:\n\n{{input}}" }
  ]
}
```

- `command` / `args`: come invocare la CLI (default `claude`) e flag liberi (es. `--model opus`).
- `shortcuts[]`: `name` (etichetta nel menu), `prompt` (una riga, passato a `claude`), `icon` opz.
- `wrappers[]`: `name`, `icon`, `template` con `{{input}}` (se manca, il testo va in coda); il
  `template` può essere multiriga e il risultato composto si copia negli appunti.

Quando l'utente chiede una scorciatoia o un wrapper per un compito ricorrente, aggiungi una voce
a `.orbit/claude.json`: Orbit ricarica il menu automaticamente.

### Cosa offre Orbit (per orientarti)
- **Editor** multi-file con *split view*; *Vai al simbolo* (Ctrl/Cmd+Shift+O); anteprima Markdown;
  viewer inline per **immagini e PDF**; si trascinano file da Esplora risorse per aprirli.
- **Terminale** integrato (più tab, scelta shell) con **finestre flottanti** multiple; i percorsi
  nell'output sono cliccabili (anche relativi).
- **Git** locale: stato, diff, stage/unstage, commit, branch, cronologia, indicatore *ahead/behind*;
  fetch/pull/push/merge girano nel terminale (riusano la tua autenticazione git).
- **Esegui ▶**: comandi da `.orbit/run.json` (vedi la sezione dedicata).
- **Scratchpad** (📝): `.orbit/scratch.md`, appunti/prompt persistenti.
- **Scaffale**: cartelle messe da parte per categoria in `.orbit/shelf.json`.
- Menu contestuali (editor e albero), decorazioni git nell'albero, vista **Docs** dei Markdown.

### File `.orbit/` (committati e modificabili)
- `run.json` — comandi del menu Esegui.
- `claude.json` — comando, scorciatoie e wrapper Claude (sopra).
- `shelf.json` — cartelle nello scaffale (preferenza personale, git-ignored).
<!-- /orbit:claude-config -->
