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
