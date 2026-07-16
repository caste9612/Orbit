// Indicatore "Uso": aggrega i token consumati da Claude Code leggendo gli STESSI transcript JSONL
// della vista Attività (~/.claude/projects/<slug>/<sessionId>.jsonl). Per ogni messaggio `assistant`
// il transcript riporta `message.model` e `message.usage` (input/output + cache). NON riporta il costo
// in $: quello lo STIMA il frontend da una tabella prezzi per modello. Parsing DIFENSIVO come
// activity.rs: le righe non riconosciute/non parsabili vengono ignorate. Nessuna dipendenza nuova.
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageRow {
    date: String,  // giorno UTC "YYYY-MM-DD" (dai primi 10 char del timestamp ISO; UTC per zero-dipendenze)
    repo: String,  // cwd reale del repo (stesso campo usato da Attività)
    model: String, // es. "claude-opus-4-8"
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    messages: u64, // numero di messaggi assistant conteggiati
}

// Chiave di aggregazione: un contatore per ciascuna combinazione {giorno, repo, modello}.
#[derive(Hash, PartialEq, Eq, Clone)]
struct Key {
    date: String,
    repo: String,
    model: String,
}

#[derive(Default)]
struct Agg {
    input: u64,
    output: u64,
    cache_creation: u64,
    cache_read: u64,
    messages: u64,
}

/// Scansiona TUTTI i transcript in ~/.claude/projects e aggrega i token per {giorno, repo, modello}.
/// `days`: se indicato, tiene solo i giorni negli ultimi N (rispetto alla data UTC odierna); default: tutti.
#[tauri::command]
pub fn scan_usage(days: Option<u32>) -> Result<Vec<UsageRow>, String> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .ok_or_else(|| "home dir not found".to_string())?;
    let dir = Path::new(&home).join(".claude").join("projects");

    let mut agg: HashMap<Key, Agg> = HashMap::new();
    // dedup globale per message.id: al resume/compattazione Claude Code ricopia la storia in nuovi
    // .jsonl, quindi lo stesso message.id ricompare (identico). Va contato UNA sola volta, altrimenti
    // i token risultano gonfiati (~2-3×). Le occorrenze duplicate hanno usage identico → tenerne una.
    let mut seen: HashSet<String> = HashSet::new();

    let projects = match std::fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()), // nessuna cartella → nessun uso
    };
    for proj in projects.flatten() {
        let pdir = proj.path();
        if !pdir.is_dir() {
            continue;
        }
        let rd = match std::fs::read_dir(&pdir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            // TODO(perf): per transcript grandi conviene una cache in .orbit/index keyed sull'mtime.
            let content = match std::fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => continue,
            };
            // Il cwd può comparire su qualunque riga: lo teniamo aggiornato per attribuire il repo
            // ai messaggi assistant (che comunque di solito lo riportano anch'essi).
            let mut repo = String::new();
            for line in content.lines() {
                let v: Value = match serde_json::from_str(line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(c) = v["cwd"].as_str().filter(|s| !s.is_empty()) {
                    repo = c.to_string();
                }
                if v["type"].as_str() != Some("assistant") {
                    continue;
                }
                let usage = &v["message"]["usage"];
                if usage.is_null() {
                    continue;
                }
                if let Some(id) = v["message"]["id"].as_str() {
                    if !seen.insert(id.to_string()) {
                        continue; // doppione (già contato altrove): salta
                    }
                }
                let date = utc_date(v["timestamp"].as_str().unwrap_or(""));
                if date.is_empty() {
                    continue;
                }
                let model = v["message"]["model"].as_str().unwrap_or("unknown").to_string();
                let a = agg.entry(Key { date, repo: repo.clone(), model }).or_default();
                a.input += usage["input_tokens"].as_u64().unwrap_or(0);
                a.output += usage["output_tokens"].as_u64().unwrap_or(0);
                a.cache_creation += usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
                a.cache_read += usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
                a.messages += 1;
            }
        }
    }

    let mut out: Vec<UsageRow> = agg
        .into_iter()
        .map(|(k, a)| UsageRow {
            date: k.date,
            repo: k.repo,
            model: k.model,
            input_tokens: a.input,
            output_tokens: a.output,
            cache_creation_tokens: a.cache_creation,
            cache_read_tokens: a.cache_read,
            messages: a.messages,
        })
        .collect();

    // Filtro "ultimi N giorni": confronto lessicografico su stringhe "YYYY-MM-DD" (UTC).
    if let Some(n) = days {
        if let Some(cut) = cutoff_date(n) {
            out.retain(|r| r.date >= cut);
        }
    }
    out.sort_by(|a, b| b.date.cmp(&a.date)); // più recenti in cima
    Ok(out)
}

// Estrae "YYYY-MM-DD" dai primi 10 char di un timestamp ISO; stringa vuota se non plausibile.
fn utc_date(ts: &str) -> String {
    let b = ts.as_bytes();
    if b.len() >= 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[8..10].iter().all(u8::is_ascii_digit)
    {
        ts[..10].to_string()
    } else {
        String::new()
    }
}

// Data UTC di taglio = oggi (UTC) meno `days` giorni, come "YYYY-MM-DD".
fn cutoff_date(days: u32) -> Option<String> {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    Some(civil_from_days(secs.div_euclid(86400) - days as i64))
}

// Algoritmo di Howard Hinnant: giorni dall'epoch (1970-01-01) → data civile "YYYY-MM-DD"
// (calendario gregoriano prolettico). Puro, senza dipendenze (no chrono).
fn civil_from_days(z: i64) -> String {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

// ---- finestre mobili 5h / 7g (STIMA "quanto sono vicino al limite") --------
// NON sono i limiti reali di Anthropic: quelli richiederebbero il token OAuth, che dal ~gen 2026 è
// bloccato lato server per usi diversi da Claude Code (HTTP 400) e vietato dai ToS (rischio ban).
// Qui stimiamo l'uso nelle ultime 5h e negli ultimi 7 giorni dai transcript; il frontend lo confronta
// con un budget scelto dall'utente. Approssimazione utile, zero credenziali/chiamate.

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowModel {
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    messages: u64,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindows {
    now: i64, // epoch (secondi) usato per calcolare le finestre
    window5h: Vec<WindowModel>,
    window7d: Vec<WindowModel>,
}

/// Uso nelle ultime 5 ore e negli ultimi 7 giorni (finestre mobili da adesso), per modello.
#[tauri::command]
pub fn scan_usage_windows() -> Result<UsageWindows, String> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .ok_or_else(|| "home dir not found".to_string())?;
    let dir = Path::new(&home).join(".claude").join("projects");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let mut m5: HashMap<String, WindowModel> = HashMap::new();
    let mut m7: HashMap<String, WindowModel> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new(); // dedup per message.id (vedi scan_usage)

    if let Ok(projects) = std::fs::read_dir(&dir) {
        for proj in projects.flatten() {
            let pdir = proj.path();
            if !pdir.is_dir() {
                continue;
            }
            let rd = match std::fs::read_dir(&pdir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            for entry in rd.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                // salta i transcript non toccati da più di ~7g (non possono avere eventi in finestra)
                let recent = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| std::time::SystemTime::now().duration_since(t).ok())
                    .map(|d| (d.as_secs() as i64) <= 7 * 86400 + 3600)
                    .unwrap_or(true); // mtime illeggibile → non saltarlo
                if !recent {
                    continue;
                }
                let content = match std::fs::read_to_string(&p) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                let lines: Vec<Value> = content.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
                accumulate_windows(&lines, now, &mut seen, &mut m5, &mut m7);
            }
        }
    }

    Ok(UsageWindows {
        now,
        window5h: m5.into_values().collect(),
        window7d: m7.into_values().collect(),
    })
}

fn accumulate_windows(
    lines: &[Value],
    now: i64,
    seen: &mut HashSet<String>,
    m5: &mut HashMap<String, WindowModel>,
    m7: &mut HashMap<String, WindowModel>,
) {
    let cut5 = now - 5 * 3600;
    let cut7 = now - 7 * 86400;
    for v in lines {
        if v["type"].as_str() != Some("assistant") {
            continue;
        }
        let usage = &v["message"]["usage"];
        if usage.is_null() {
            continue;
        }
        if let Some(id) = v["message"]["id"].as_str() {
            if !seen.insert(id.to_string()) {
                continue; // doppione (già contato): salta
            }
        }
        let ep = match parse_epoch(v["timestamp"].as_str().unwrap_or("")) {
            Some(e) => e,
            None => continue,
        };
        if ep < cut7 {
            continue;
        }
        let model = v["message"]["model"].as_str().unwrap_or("unknown").to_string();
        add_usage(m7.entry(model.clone()).or_default(), &model, usage);
        if ep >= cut5 {
            add_usage(m5.entry(model.clone()).or_default(), &model, usage);
        }
    }
}

fn add_usage(w: &mut WindowModel, model: &str, usage: &Value) {
    w.model = model.to_string();
    w.input_tokens += usage["input_tokens"].as_u64().unwrap_or(0);
    w.output_tokens += usage["output_tokens"].as_u64().unwrap_or(0);
    w.cache_creation_tokens += usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
    w.cache_read_tokens += usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
    w.messages += 1;
}

// Epoch (secondi) da un timestamp ISO "YYYY-MM-DDTHH:MM:SS…"; assume UTC (i transcript usano 'Z').
fn parse_epoch(ts: &str) -> Option<i64> {
    if ts.len() < 19 {
        return None;
    }
    let n = |a: usize, b: usize| -> Option<i64> { ts.get(a..b)?.parse::<i64>().ok() };
    let (y, mo, d) = (n(0, 4)?, n(5, 7)?, n(8, 10)?);
    let (h, mi, s) = (n(11, 13)?, n(14, 16)?, n(17, 19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 60 {
        return None;
    }
    Some(days_from_civil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s)
}

// Inverso di civil_from_days: (anno, mese, giorno) → giorni dall'epoch (1970-01-01). Hinnant.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = if m > 2 { m - 3 } else { m + 9 }; // [0, 11]
    let doy = (153 * mp + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146097 + doe - 719468
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn asst(ts: &str, model: &str, inp: u64, out: u64, cc: u64, cr: u64) -> Value {
        json!({
            "type": "assistant",
            "timestamp": ts,
            "cwd": "/repo",
            "message": {
                "model": model,
                "usage": {
                    "input_tokens": inp,
                    "output_tokens": out,
                    "cache_creation_input_tokens": cc,
                    "cache_read_input_tokens": cr
                }
            }
        })
    }

    // Piccolo aggregatore in-memory che riusa la stessa logica di scan_usage sulle righe fornite,
    // così i test non toccano il filesystem.
    fn agg_lines(lines: &[Value]) -> HashMap<Key, Agg> {
        let mut agg: HashMap<Key, Agg> = HashMap::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut repo = String::new();
        for v in lines {
            if let Some(c) = v["cwd"].as_str().filter(|s| !s.is_empty()) {
                repo = c.to_string();
            }
            if v["type"].as_str() != Some("assistant") {
                continue;
            }
            let usage = &v["message"]["usage"];
            if usage.is_null() {
                continue;
            }
            if let Some(id) = v["message"]["id"].as_str() {
                if !seen.insert(id.to_string()) {
                    continue;
                }
            }
            let date = utc_date(v["timestamp"].as_str().unwrap_or(""));
            if date.is_empty() {
                continue;
            }
            let model = v["message"]["model"].as_str().unwrap_or("unknown").to_string();
            let a = agg.entry(Key { date, repo: repo.clone(), model }).or_default();
            a.input += usage["input_tokens"].as_u64().unwrap_or(0);
            a.output += usage["output_tokens"].as_u64().unwrap_or(0);
            a.cache_creation += usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
            a.cache_read += usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
            a.messages += 1;
        }
        agg
    }

    #[test]
    fn sums_same_day_model() {
        let lines = vec![
            asst("2026-07-16T10:00:00Z", "claude-opus-4-8", 100, 20, 5, 3),
            asst("2026-07-16T11:00:00Z", "claude-opus-4-8", 50, 10, 1, 2),
        ];
        let agg = agg_lines(&lines);
        assert_eq!(agg.len(), 1, "stesso giorno+modello → una sola riga");
        let a = agg.values().next().unwrap();
        assert_eq!((a.input, a.output, a.cache_creation, a.cache_read, a.messages), (150, 30, 6, 5, 2));
    }

    #[test]
    fn splits_by_model_and_day() {
        let lines = vec![
            asst("2026-07-16T10:00:00Z", "claude-opus-4-8", 100, 20, 0, 0),
            asst("2026-07-16T10:05:00Z", "claude-sonnet-5", 100, 20, 0, 0),
            asst("2026-07-15T10:00:00Z", "claude-opus-4-8", 100, 20, 0, 0),
        ];
        assert_eq!(agg_lines(&lines).len(), 3, "modello o giorno diverso → righe diverse");
    }

    #[test]
    fn ignores_non_assistant_and_missing_usage() {
        let lines = vec![
            json!({"type":"user","timestamp":"2026-07-16T10:00:00Z","cwd":"/repo","message":{"content":"ciao"}}),
            json!({"type":"assistant","timestamp":"2026-07-16T10:01:00Z","cwd":"/repo","message":{"model":"claude-opus-4-8"}}),
            asst("2026-07-16T10:02:00Z", "claude-opus-4-8", 10, 5, 0, 0),
        ];
        let agg = agg_lines(&lines);
        assert_eq!(agg.len(), 1);
        assert_eq!(agg.values().next().unwrap().messages, 1, "solo l'assistant con usage conta");
    }

    #[test]
    fn utc_date_parsing() {
        assert_eq!(utc_date("2026-07-16T10:00:00.123Z"), "2026-07-16");
        assert_eq!(utc_date("2026-07-16"), "2026-07-16");
        assert_eq!(utc_date("boh"), "");
        assert_eq!(utc_date("2026/07/16T.."), "");
        assert_eq!(utc_date(""), "");
    }

    #[test]
    fn civil_from_days_known_dates() {
        assert_eq!(civil_from_days(0), "1970-01-01");
        assert_eq!(civil_from_days(-1), "1969-12-31");
        assert_eq!(civil_from_days(10957), "2000-01-01"); // 30 anni + 7 bisestili = 10957 giorni
    }

    fn iso_at(epoch: i64) -> String {
        let date = civil_from_days(epoch.div_euclid(86400));
        let rem = epoch.rem_euclid(86400);
        format!("{date}T{:02}:{:02}:{:02}Z", rem / 3600, (rem % 3600) / 60, rem % 60)
    }
    fn asst_ts(ts: &str, model: &str, inp: u64, out: u64) -> Value {
        json!({"type":"assistant","timestamp":ts,"cwd":"/repo",
            "message":{"model":model,"usage":{"input_tokens":inp,"output_tokens":out,
                "cache_creation_input_tokens":0,"cache_read_input_tokens":0}}})
    }

    #[test]
    fn parse_epoch_and_days() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2000, 1, 1), 10957);
        assert_eq!(parse_epoch("2000-01-01T00:00:00Z"), Some(946_684_800));
        assert_eq!(parse_epoch("2000-01-01T00:00:00.123Z"), Some(946_684_800));
        assert_eq!(parse_epoch("nope"), None);
        assert_eq!(parse_epoch("2000-13-01T00:00:00Z"), None);
        // round-trip: iso_at(x) → parse_epoch → x
        assert_eq!(parse_epoch(&iso_at(1_700_000_000)), Some(1_700_000_000));
    }

    // Dump diagnostico su DATI REALI (~/.claude/projects): ignorato di default (dipende dalla
    // macchina). Esegui con:  cargo test --manifest-path src-tauri/Cargo.toml dump_real_usage -- --ignored --nocapture
    // Scrive i totali (grand + per-modello + finestre 5h/7g + `now`) in %TEMP%/orbit_usage_dump.json,
    // così un calcolatore Node indipendente può fare il diff esatto. Nessun contenuto di prompt: solo numeri.
    #[test]
    #[ignore]
    fn dump_real_usage() {
        use std::collections::BTreeMap;
        let rows = scan_usage(None).expect("scan_usage");
        let mut grand = [0u64; 5]; // input, output, cacheCreation, cacheRead, messages
        let mut per: BTreeMap<String, [u64; 5]> = BTreeMap::new();
        for r in &rows {
            let e = per.entry(r.model.clone()).or_insert([0; 5]);
            let vals = [r.input_tokens, r.output_tokens, r.cache_creation_tokens, r.cache_read_tokens, r.messages];
            for i in 0..5 {
                e[i] += vals[i];
                grand[i] += vals[i];
            }
        }
        let w = scan_usage_windows().expect("scan_usage_windows");
        let sum = |v: &[WindowModel]| {
            let mut s = [0u64; 5];
            for m in v {
                let vals = [m.input_tokens, m.output_tokens, m.cache_creation_tokens, m.cache_read_tokens, m.messages];
                for i in 0..5 {
                    s[i] += vals[i];
                }
            }
            s
        };
        let out = json!({
            "grand": grand, "perModel": per, "now": w.now,
            "w5": sum(&w.window5h), "w7": sum(&w.window7d), "rows": rows.len(),
        });
        let path = std::env::temp_dir().join("orbit_usage_dump.json");
        std::fs::write(&path, serde_json::to_string_pretty(&out).unwrap()).unwrap();
        println!("WROTE {}", path.display());
    }

    #[test]
    fn windows_filter_by_time() {
        let now = 1_700_000_000i64;
        let lines = vec![
            asst_ts(&iso_at(now - 3600), "claude-opus-4-8", 10, 5), // 1h fa → dentro 5h e 7g
            asst_ts(&iso_at(now - 2 * 86400), "claude-opus-4-8", 100, 50), // 2g fa → solo 7g
            asst_ts(&iso_at(now - 10 * 86400), "claude-opus-4-8", 999, 999), // 10g fa → fuori tutto
        ];
        let mut seen = HashSet::new();
        let mut m5 = HashMap::new();
        let mut m7 = HashMap::new();
        accumulate_windows(&lines, now, &mut seen, &mut m5, &mut m7);
        let sum5: u64 = m5.values().map(|w| w.input_tokens).sum();
        let sum7: u64 = m7.values().map(|w| w.input_tokens).sum();
        assert_eq!(sum5, 10, "solo l'evento di 1h fa è nelle 5h");
        assert_eq!(sum7, 110, "eventi di 1h e 2g fa nei 7g; escluso quello di 10g");
    }

    #[test]
    fn scan_usage_dedups_message_id() {
        let mut a = asst("2026-07-16T10:00:00Z", "claude-opus-4-8", 100, 20, 5, 3);
        a["message"]["id"] = json!("msg_1");
        let dup = a.clone(); // stesso message.id (resume/compattazione) → doppione identico
        let agg = agg_lines(&[a, dup]);
        assert_eq!(agg.len(), 1);
        let w = agg.values().next().unwrap();
        assert_eq!(w.messages, 1, "message.id contato una sola volta");
        assert_eq!(w.input, 100, "token non raddoppiati dal doppione");
    }

    #[test]
    fn windows_dedup_message_id() {
        let now = 1_700_000_000i64;
        let mut a = asst_ts(&iso_at(now - 3600), "claude-opus-4-8", 10, 5);
        a["message"]["id"] = json!("m1");
        let dup = a.clone();
        let mut seen = HashSet::new();
        let mut m5 = HashMap::new();
        let mut m7 = HashMap::new();
        accumulate_windows(&[a, dup], now, &mut seen, &mut m5, &mut m7);
        let s5: u64 = m5.values().map(|w| w.input_tokens).sum();
        assert_eq!(s5, 10, "doppione contato una sola volta nella finestra 5h");
    }
}
