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
import { log, logError } from "./state/logs.svelte";

/** Scrive `text` negli appunti. Ritorna true se riuscita. Non lancia. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await pluginWriteText(text);
    log("clipboard", "write ok (plugin)", { len: text.length });
    return true;
  } catch (e) {
    try {
      await navigator.clipboard.writeText(text);
      log("clipboard", "write ok (navigator fallback)", { len: text.length, pluginErr: String(e) }, "warn");
      return true;
    } catch (e2) {
      logError("clipboard", "write FAILED", { len: text.length, err: String(e2) });
      return false;
    }
  }
}

/** Legge il testo dagli appunti. Ritorna la stringa (anche "" se vuoti) oppure `null` se la
 *  lettura è FALLITA — distinto da "appunti vuoti", così il chiamante può segnalare l'errore
 *  invece di incollare nulla in silenzio. Non lancia. */
export async function readClipboard(): Promise<string | null> {
  try {
    const t = await pluginReadText();
    log("clipboard", "read ok (plugin)", { len: t?.length ?? 0 });
    return t;
  } catch (e) {
    try {
      const t = await navigator.clipboard.readText();
      log("clipboard", "read ok (navigator fallback)", { len: t?.length ?? 0, pluginErr: String(e) }, "warn");
      return t;
    } catch (e2) {
      logError("clipboard", "read FAILED", { err: String(e2) });
      return null;
    }
  }
}
