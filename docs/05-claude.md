# Claude

Orbit is a companion for Claude Code. It never talks to Claude's API; it runs the `claude` CLI in its
terminals and reads the files Claude Code writes on disk.

## Launching a chat

- `claude.launchClaude(prompt?, title, { side? })` opens a terminal tab in the project root with `kind:
  "claude"` and an `initCommand` built from `.orbit/claude.json`: `command` and `args` (e.g.
  `--model opus`), plus the prompt in quotes for a shortcut.
  - `side` opens it in a pane next to the active one.
- Claude always starts interactive, so you see what it does (important for commits and pushes).
- **At startup**, with *Launch Claude in the default terminal* on, the first terminal of the repo is a
  chat. This happens only at startup (`App.svelte`) and only if the repo has no restored tabs. The `+`
  button and the terminal icon always open a plain shell, so Claude never starts by surprise.
- **The bell** — `ensureBellChannel(root)` runs before every launch. If the bell notification is on, it
  adds `preferredNotifChannel: "terminal_bell"` to the project's `.claude/settings.local.json`, which is
  local and git-ignored, so Claude rings when it finishes or waits.
  - The merge is non-destructive: an existing value is kept, and an invalid file is left alone.
  - A light window writes nothing.
  - See [Terminal](04-terminal.md#attention-a-terminal-waiting-for-you).

## `.orbit/claude.json`: shortcuts and wrappers

```json
{
  "command": "claude",
  "args": "",
  "shortcuts": [{ "name": "…", "icon": "book-open", "prompt": "one line, passed to claude" }],
  "wrappers": [{ "name": "…", "icon": "search", "template": "multi-line text with {{input}}" }]
}
```

- **Shortcuts** run `claude "<prompt>"` in a new tab (`runShortcut`).
- **Wrappers** are templates. `WrapperComposer.svelte` puts your text in place of `{{input}}` (at the end
  if missing) and **copies the result** to the clipboard: no shell is involved, so multi-line is fine.
- `ClaudePrompts.svelte` (*Add / remove prompts…*) writes the file. *Edit .orbit/claude.json* opens it in
  the editor and creates it with the defaults if missing. Both are also in Settings → Claude.
- The file is read with `readOrbitConfig`:
  - absent → the defaults;
  - invalid JSON → a warning, and the menu stays as it was instead of resetting.
  - It reloads live when the file changes (`fs-changed`).
- *Update CLAUDE.md for Claude* (`teachClaudeConfig`) writes a marked section into the project's
  `CLAUDE.md`, describing Orbit and the `.orbit/` files, so Claude can add shortcuts and run
  configurations itself. The Run menu has the same for `run.json`.

## Which conversation runs in a tab

Claude Code keeps a registry of its running chats: one file per process,
`<config>/sessions/<pid>.json`, with `pid`, `sessionId`, `cwd`, `startedAt`, status. `<config>` is
`CLAUDE_CONFIG_DIR` or `~/.claude`. Orbit reads it (M66, `src-tauri/src/claudeproc.rs`):
- `pty_claude_sessions(ids)` takes the PID of each tab's shell (the PTY child) and walks its descendants
  breadth-first.
  - **Process table**: ToolHelp on Windows, `ps` elsewhere.
  - **Match**: the first descendant with a registry file is the interactive chat. A subprocess with its
    own entry is further down, so it's never picked.
  - **Rejected**: entries that started before the shell (a recycled pid) and invalid ids.
  - It runs on a background thread.
- It reads what the running process reports, so it also works for a `claude` started by hand in a shell
  (that tab is then saved as a chat). The registry should follow a `/clear` or a `/resume` done inside the
  chat; that hasn't been verified with a real session yet.
- Nothing is added to your command line and nothing to Claude's settings, so a custom `command` keeps
  working.
- `claude_transcripts(ids)` tells which conversations have a transcript
  (`<config>/projects/*/<id>.jsonl`). A chat opened and never used has none, and `--resume` would fail.

## Resuming chats

- **From Activity** — *Resume this chat* calls `resumeClaude(id)`, which runs `claude --resume <id>` in
  the repo. If a tab already shows that conversation (even a dormant one), it goes there instead of
  opening a duplicate (`tabWithChat`).
- **After a restart** — the saved chats come back as dormant tabs and resume when you look at them
  ([Terminal](04-terminal.md#restore-after-a-restart)). `chatCommand(id)` builds the command line at that
  moment:
  - it re-reads the repo's `.orbit/claude.json`, so flags such as `--model` apply;
  - it enables the bell;
  - it falls back to a new chat when the transcript is missing.

## The Activity view

A timeline of what you and Claude did across **all** your projects, rebuilt from Claude Code's transcripts
(`~/.claude/projects/*/*.jsonl`).

**Backend** (`activity.rs`):
- `scan_activity(limit)` reconstructs **work units**, prompt first: a user prompt plus the files and
  commands it triggered is one unit.
  - **Commits**: a `git commit` labels the unit it falls in. The message is read only from the flags
    (`-m`, `-am`, `--message=`, `-F -` with a heredoc, PowerShell here-strings).
  - **Boundaries**: a branch change is a hard one. Work that continues after a commit or branch change
    is labelled `↳ <the request it came from>`.
  - **File stats**: the file +/− counts come from `toolUseResult.structuredPatch`, and the full prompt
    text is kept for the digests.
  - **Caching**: per transcript, keyed on mtime + size (M59). A transcript that only grew is read from
    where the last scan stopped, and its segmentation resumes from the saved state (`Fold`, M62): 4 ms
    per update on a 40 MB live transcript instead of 134 ms. It runs on a background thread.
- `watch_activity` watches the projects folder and emits a debounced `activity-changed`.

**Frontend**:
- `activity.svelte.ts` holds the units (`$state.raw`; unchanged units keep their object, so the board
  redraws only what changed), the projects shown or hidden (`activityPrefs`, persisted), and a stable
  color and label per session.
- `ActivityPanel.svelte` (sidebar): project toggles and mini statistics.
- `ActivityBoard.svelte` (an editor tab, kind `activity`) has two lenses:
  - **Timeline**: one row per unit on a shared time axis, repos in columns, day dividers. A chat header
    marks where the conversation changes within a column.
  - **Chats**: one card per conversation, grouped by day.
- `UnitDigest.svelte` shows one unit. `ChatDigest.svelte` shows a whole conversation, every prompt with
  its outcome, with *Resume this chat*. The chat is the resume atom: `claude --resume` restarts whole
  sessions only.
