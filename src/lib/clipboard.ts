// Clipboard centralizzata e affidabile per tutta l'app (terminale, editor, explorer, composer).
//
// Perché un helper unico: prima ogni punto usava direttamente `navigator.clipboard.*` con un
// `.catch(() => {})` che INGOIAVA gli errori. Su WebView2 la write/read asincrona può fallire
// (richiede focus/attivazione utente; un TUI con mouse-reporting come Claude complica il quadro):
// l'errore spariva, la clipboard restava col valore VECCHIO e l'incolla successivo restituiva
// "roba vecchia" senza alcun segnale all'utente.
//
// Strategia: si preferisce il PLUGIN TAURI (clipboard lato Rust, fuori dai limiti del WebView),
// con fallback all'API web se il plugin non è disponibile (es. non ancora registrato lato Rust,
// o contesto non-Tauri). NON si ingoiano gli errori: si ritorna l'esito così il chiamante può
// dare un feedback reale (toast) o evitare azioni distruttive (es. "taglia" non cancella se la
// copia non è riuscita).
import { readText as pluginReadText, writeText as pluginWriteText } from "@tauri-apps/plugin-clipboard-manager";

/** Scrive `text` negli appunti. Ritorna true se riuscita. Non lancia. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await pluginWriteText(text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

/** Legge il testo dagli appunti. Ritorna la stringa (anche "" se vuoti) oppure `null` se la
 *  lettura è FALLITA — distinto da "appunti vuoti", così il chiamante può segnalare l'errore
 *  invece di incollare nulla in silenzio. Non lancia. */
export async function readClipboard(): Promise<string | null> {
  try {
    return await pluginReadText();
  } catch {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }
}
