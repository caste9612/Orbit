// Operazioni git locali via libgit2 (crate git2). Ogni comando riapre il repo
// (semplice, niente stato condiviso da gestire). Tutte le operazioni sono locali.
use git2::build::CheckoutBuilder;
use git2::{
    BranchType, DiffFormat, DiffOptions, ObjectType, Oid, Repository, Signature, Sort, Status,
    StatusOptions,
};
use serde::Serialize;
use std::path::Path;

fn open(root: &str) -> Result<Repository, String> {
    Repository::discover(root).map_err(|e| e.to_string())
}

fn current_branch(repo: &Repository) -> Option<String> {
    let head = repo.head().ok()?;
    head.shorthand().map(|s| s.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    path: String,
    staged: Option<String>,
    unstaged: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    is_repo: bool,
    branch: Option<String>,
    entries: Vec<StatusEntry>,
}

fn index_code(s: Status) -> Option<String> {
    if s.contains(Status::INDEX_NEW) {
        Some("A".into())
    } else if s.contains(Status::INDEX_MODIFIED) {
        Some("M".into())
    } else if s.contains(Status::INDEX_DELETED) {
        Some("D".into())
    } else if s.contains(Status::INDEX_RENAMED) {
        Some("R".into())
    } else if s.contains(Status::INDEX_TYPECHANGE) {
        Some("T".into())
    } else {
        None
    }
}

fn wt_code(s: Status) -> Option<String> {
    if s.contains(Status::WT_NEW) {
        Some("U".into()) // untracked
    } else if s.contains(Status::WT_MODIFIED) {
        Some("M".into())
    } else if s.contains(Status::WT_DELETED) {
        Some("D".into())
    } else if s.contains(Status::WT_RENAMED) {
        Some("R".into())
    } else if s.contains(Status::WT_TYPECHANGE) {
        Some("T".into())
    } else {
        None
    }
}

#[tauri::command]
pub fn git_status(root: String) -> Result<GitStatus, String> {
    let repo = match Repository::discover(&root) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitStatus {
                is_repo: false,
                branch: None,
                entries: vec![],
            })
        }
    };
    let branch = current_branch(&repo);
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for e in statuses.iter() {
        let s = e.status();
        if s.is_ignored() {
            continue;
        }
        let staged = index_code(s);
        let unstaged = wt_code(s);
        if staged.is_none() && unstaged.is_none() {
            continue;
        }
        entries.push(StatusEntry {
            path: e.path().unwrap_or("").to_string(),
            staged,
            unstaged,
        });
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(GitStatus {
        is_repo: true,
        branch,
        entries,
    })
}

#[tauri::command]
pub fn git_diff(root: String, path: String, staged: bool) -> Result<String, String> {
    let repo = open(&root)?;
    let mut opts = DiffOptions::new();
    opts.pathspec(&path)
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
            .map_err(|e| e.to_string())?
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
            .map_err(|e| e.to_string())?
    };

    let mut out = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        match line.origin() {
            '+' | '-' | ' ' => out.push(line.origin()),
            _ => {}
        }
        out.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(|e| e.to_string())?;

    if out.is_empty() {
        out.push_str("(nessuna differenza testuale)");
    }
    Ok(out)
}

#[tauri::command]
pub fn git_stage(root: String, path: String) -> Result<(), String> {
    let repo = open(&root)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let p = Path::new(&path);
    let full = repo
        .workdir()
        .map(|w| w.join(p))
        .unwrap_or_else(|| p.to_path_buf());
    if full.exists() {
        index.add_path(p).map_err(|e| e.to_string())?;
    } else {
        index.remove_path(p).map_err(|e| e.to_string())?;
    }
    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage(root: String, path: String) -> Result<(), String> {
    let repo = open(&root)?;
    match repo.head().ok().and_then(|h| h.peel(ObjectType::Commit).ok()) {
        Some(obj) => {
            repo.reset_default(Some(&obj), [path.as_str()])
                .map_err(|e| e.to_string())?;
        }
        None => {
            // repo senza commit: rimuovi semplicemente dall'index
            let mut index = repo.index().map_err(|e| e.to_string())?;
            index.remove_path(Path::new(&path)).ok();
            index.write().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<String, String> {
    let repo = open(&root)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;

    let sig = repo
        .signature()
        .or_else(|_| Signature::now("Orbit", "orbit@localhost"))
        .map_err(|e| e.to_string())?;

    let parents: Vec<git2::Commit> = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok())
        .into_iter()
        .collect();
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parent_refs)
        .map_err(|e| e.to_string())?;
    Ok(oid.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branches {
    current: Option<String>,
    all: Vec<String>,
}

#[tauri::command]
pub fn git_branches(root: String) -> Result<Branches, String> {
    let repo = open(&root)?;
    let current = current_branch(&repo);
    let mut all = Vec::new();
    let branches = repo
        .branches(Some(BranchType::Local))
        .map_err(|e| e.to_string())?;
    for b in branches.flatten() {
        if let Ok(Some(name)) = b.0.name() {
            all.push(name.to_string());
        }
    }
    all.sort();
    Ok(Branches { current, all })
}

#[tauri::command]
pub fn git_checkout_branch(root: String, name: String) -> Result<(), String> {
    let repo = open(&root)?;
    let refname = format!("refs/heads/{}", name);
    let obj = repo.revparse_single(&refname).map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    repo.set_head(&refname).map_err(|e| e.to_string())?;
    Ok(())
}

/// Annulla le modifiche di un file: gli untracked vengono eliminati, i file tracciati
/// riportati allo stato di HEAD (workdir + index). Operazione distruttiva (conferma a UI).
#[tauri::command]
pub fn git_discard(root: String, path: String) -> Result<(), String> {
    let repo = open(&root)?;
    let status = repo.status_file(Path::new(&path)).map_err(|e| e.to_string())?;
    // untracked puro → rimuovi dal disco (HEAD non lo conosce)
    if status.contains(Status::WT_NEW) && !status.contains(Status::INDEX_NEW) {
        if let Some(wd) = repo.workdir() {
            let full = wd.join(&path);
            if full.is_dir() {
                std::fs::remove_dir_all(&full).map_err(|e| e.to_string())?;
            } else if full.exists() {
                std::fs::remove_file(&full).map_err(|e| e.to_string())?;
            }
        }
        return Ok(());
    }
    // tracciato → ripristina a HEAD per quel path
    let mut cb = CheckoutBuilder::new();
    cb.force().path(path.as_str());
    repo.checkout_head(Some(&mut cb)).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    id: String,
    short: String,
    summary: String,
    author: String,
    time: i64, // secondi epoch
}

/// Cronologia dei commit a partire da HEAD (i più recenti prima), fino a `limit`.
#[tauri::command]
pub fn git_log(root: String, limit: usize) -> Result<Vec<CommitInfo>, String> {
    let repo = open(&root)?;
    let mut rw = repo.revwalk().map_err(|e| e.to_string())?;
    if rw.push_head().is_err() {
        return Ok(vec![]); // HEAD unborn: nessun commit
    }
    rw.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for oid in rw {
        if out.len() >= limit {
            break;
        }
        let oid = match oid {
            Ok(o) => o,
            Err(_) => continue,
        };
        let c = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let author = c.author();
        let id = oid.to_string();
        let short = id.chars().take(7).collect();
        out.push(CommitInfo {
            id,
            short,
            summary: c.summary().unwrap_or("").to_string(),
            author: author.name().unwrap_or("").to_string(),
            time: c.time().seconds(),
        });
    }
    Ok(out)
}

/// Crea un nuovo branch da HEAD e ci passa sopra (create + switch).
#[tauri::command]
pub fn git_create_branch(root: String, name: String) -> Result<(), String> {
    let repo = open(&root)?;
    let commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|_| "Nessun commit su HEAD: crea prima un commit".to_string())?;
    repo.branch(&name, &commit, false).map_err(|e| e.to_string())?;
    let refname = format!("refs/heads/{}", name);
    let obj = repo.revparse_single(&refname).map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    repo.set_head(&refname).map_err(|e| e.to_string())?;
    Ok(())
}

/// Patch (diff vs primo genitore) di un commit, per la vista di dettaglio.
#[tauri::command]
pub fn git_show(root: String, id: String) -> Result<String, String> {
    let repo = open(&root)?;
    let oid = Oid::from_str(&id).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut opts = DiffOptions::new();
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(|e| e.to_string())?;
    let mut out = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        match line.origin() {
            '+' | '-' | ' ' => out.push(line.origin()),
            _ => {}
        }
        out.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(|e| e.to_string())?;
    if out.is_empty() {
        out.push_str("(nessuna differenza)");
    }
    Ok(out)
}
