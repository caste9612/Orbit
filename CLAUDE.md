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
## Integrazione Claude (Orbit)

Orbit mostra un menu **Claude** con cui aprire Claude Code in una tab del terminale
(nella radice del progetto) e lanciare *scorciatoie*: prompt predefiniti avviati come
`claude "<prompt>"`. Comando, flag e scorciatoie vivono in `.orbit/claude.json`:

```json
{
  "command": "claude",
  "args": "",
  "shortcuts": [
    { "name": "Aggiorna documentazione", "icon": "book-open", "prompt": "Rileggi il progetto e aggiorna README e docs/…" },
    { "name": "Esegui i test e correggi", "icon": "play", "prompt": "Esegui la suite di test e sistema i fallimenti, spiegandomi le cause." }
  ]
}
```

- `command`: come invocare la CLI di Claude (default `claude`).
- `args`: flag liberi passati a Claude (es. `--model opus`); opzionale.
- `shortcuts[].name`: etichetta nel menu Claude.
- `shortcuts[].prompt`: prompt iniziale (una riga), passato a `claude` come argomento.
- `shortcuts[].icon` (opzionale): nome icona (es. `doc`, `search`, `git-commit`, `play`).

Quando l'utente chiede una scorciatoia per un compito ricorrente (aggiornare i docs,
lanciare i test, fare release…), aggiungi una voce a `.orbit/claude.json`: Orbit ricarica
il menu automaticamente.
