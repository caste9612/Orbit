# Release

How a version is numbered, built, signed and published, and how installed copies update themselves.

There are two ways to publish, with the same script and the same result:
- **from GitHub Actions**, the usual way: the Release workflow runs `scripts/New-Release.ps1` on a GitHub
  runner, with the signing key kept in the secrets of the `release` environment. It works from any PC, or
  from the browser, and the key never has to be copied to a PC;
- **locally**, on a PC that has the key: the same script in PowerShell 7.

## Version number

The version lives in **six places**, and they must agree:
- `package.json`;
- `package-lock.json`, twice: the root `version` and `packages[""].version`;
- `src-tauri/Cargo.toml`;
- `src-tauri/Cargo.lock` (the `orbit` package);
- `src-tauri/tauri.conf.json`.

Edit the two lockfile fields **by hand**. On the maintainer's machine, npm 11 rewrites the lockfile with
`"peer": true` markers, so `npm install` is not a clean way to sync it, and that noise shouldn't be
committed. The release script refuses to build when the six disagree.

## Release notes

Each version's notes are written in `NOTES.md`, in English, as a ```` ```markdown ```` block inside the
section `## Versione X.Y.Z`. They become the release text on GitHub and the "what's new" Orbit shows
before updating. Keeping them in the commit of the release means notes and version always travel together.

`scripts/Get-ReleaseNotes.ps1` extracts the block of the version in `tauri.conf.json`:

```powershell
.\scripts\Get-ReleaseNotes.ps1                   # writes artifacts\notes-X.Y.Z.md and prints its path
.\scripts\Get-ReleaseNotes.ps1 -OutFile notes.md
```

- It stops with an error when the section or its block is missing or empty.
- The block can't contain a fenced code block of its own: the first ```` ``` ```` closes it.
- It writes UTF-8 with LF line endings, whatever the checkout uses.

## Publishing from GitHub Actions

`.github/workflows/release.yml` runs only by hand (`workflow_dispatch`), never on pull requests: the repo
is public.

### Running it

- **From the browser**: Actions → **Release** → **Run workflow**, on `main`. Fill in the title (what comes
  after "Orbit vX.Y.Z — ") and tick **publish** to create the release.
- **From any terminal** with `gh`:

  ```powershell
  gh workflow run release.yml -f title="Room for all your repos"                  # dry run
  gh workflow run release.yml -f title="Room for all your repos" -f publish=true  # GitHub release
  gh run watch                                                                    # follow it
  ```

- **Approve it.** The job waits until the maintainer approves the `release` environment. Use **Review
  deployments → Approve and deploy** on the run page (GitHub Mobile shows it too), or a terminal:

  ```powershell
  $run = gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId'
  $envId = gh api repos/caste9612/Orbit/environments/release --jq .id
  gh api -X POST "repos/caste9612/Orbit/actions/runs/$run/pending_deployments" `
    -F "environment_ids[]=$envId" -f state=approved -f comment=ok
  ```

- **Without publish** (the default) it's a **dry run**. It builds and signs, and the installers, their
  signatures and `latest.json` stay as the run's artifact for 14 days. Fetch them with
  `gh run download <run id>` to check or to try the setup.
- **The sizes** of the signed executable, setup and MSI are printed in the run's summary.

### What it does

1. Checks out the commit with its whole history, because the script checks that the commit is on GitHub.
2. Sets up the tools: Node 24 with `npm ci`, and the latest stable Rust. A cache keeps cargo's downloads and
   `src-tauri/target`; it's written only by this workflow, on `main`.
3. Extracts the notes with `Get-ReleaseNotes.ps1`, before any secret is used: a missing section stops the run
   there.
4. Writes the key from its secret to a temporary file and passes it with `-KeyPath`. The password goes in
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
5. Runs `New-Release.ps1`, with `-Publish` when asked. The checks, installers and `latest.json` are those of
   a local release.
6. Deletes the key file, prints the sizes and uploads `artifacts/release`.

- With publish, the release is created by `github-actions[bot]`, with the workflow's own token
  (`contents: write`).
- The inputs reach the script through environment variables, never pasted into it, so a title can't become
  code.
- Only GitHub's own actions are used, each pinned to a commit with its version in a comment. To update one,
  pick the commit of a release that's at least a couple of weeks old.

### Where the key lives

The `release` environment (Settings → Environments) holds two secrets:

| Secret | Content |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | The key file, `~/.tauri/orbit-updater.key`, still encrypted with its password |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password |

- Only a job running on `main` gets them, and only after the maintainer approves the run.
- Secrets can be replaced but never read back, so they are not a backup (see [The signing key](#the-signing-key)).
- To set or replace them, run this in PowerShell 7 on the PC that has the key:

  ```powershell
  Get-Content -Raw "$HOME\.tauri\orbit-updater.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY --env release --repo caste9612/Orbit
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release --repo caste9612/Orbit   # asks for the value
  ```

## Publishing locally

`scripts/New-Release.ps1` (PowerShell 7), on a PC that has the key:

```powershell
.\scripts\New-Release.ps1 -Notes (.\scripts\Get-ReleaseNotes.ps1) -Title "…"            # build only
.\scripts\New-Release.ps1 -Notes (.\scripts\Get-ReleaseNotes.ps1) -Title "…" -Publish   # build + GitHub release
```

1. **Checks the version** in the six places.
2. **Checks the signing key**, `-KeyPath`, by default `~/.tauri/orbit-updater.key`, kept outside the
   repo:
   - it's password-protected (since 1.0). The script asks for the password without showing it, or
     reads `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
   - it tries the password by signing a test file before compiling, and clears it from the environment
     at the end.
3. **Builds in release** with the signing key: the NSIS setup and the MSI, each with its `.sig`.
4. **Writes `latest.json`** — version, notes, date, and for each platform key (`windows-x86_64`,
   `-nsis`, `-msi`) the installer URL and its signature — and copies everything into
   `artifacts\release` (git-ignored).
5. **With `-Publish`** it first checks that the working tree is clean, the commit is already on GitHub
   and the release doesn't exist yet. Then it creates the release with `gh`: tag `vX.Y.Z` on the
   compiled commit, the notes as its text, installers, signatures and `latest.json` as assets.

A plain `npm run tauri build` needs no key: `createUpdaterArtifacts` is set only by the script.

## The signing key

- **Back it up**: the key file and its password, together and outside the PCs, for example in a password
  manager with the file attached to the entry. The copy in GitHub's secrets can't be read back.
- Losing the key, or its password, means installed copies can no longer verify new versions. Recovering
  takes a new key and a manual reinstall.
- The public key is in `tauri.conf.json` (`plugins.updater.pubkey`). An installed copy checks updates
  against the public key **built into it**.

### If the key changes

- **Planned change**, while the old key still works:
  1. Generate the new key, with a password, with `npx tauri signer generate -w <path>`. Back it up.
  2. Put its public key in `tauri.conf.json` and release that version **signed with the old key**.
     Installed copies accept it, and from then on they trust the new key.
     - Leave it as the latest release for a while: a copy that skips it can't verify the next one.
  3. Replace the two secrets with the new key and password (commands above), and the file on the local PC.
  4. From the next version on, releases are signed with the new key.
- **Key or password lost**: generate a new key, put its public key in `tauri.conf.json` and set the new
  secrets. Installed copies won't accept that version, so it must be installed by hand from the release
  page. Say so in its notes.

## Installers

| Artifact | Notes |
|---|---|
| `Orbit_X.Y.Z_x64-setup.exe` (NSIS) | Recommended. Its hooks (`src-tauri/windows/hooks.nsh`) put Orbit in the **Open with** menu of text, code, image and PDF files without making it their default, and hand back the defaults that pre-1.0 versions took over; `UserChoice` is never touched |
| `Orbit_X.Y.Z_x64_en-US.msi` | Installs Orbit but registers no "Open with" (a WiX fragment with `OpenWithProgids` would be the equivalent) |
| `orbit.exe` (portable) | ~6.8 MiB; ≈0.7 MiB of it is the HTTPS client of the updater |

On Windows, `bundle.fileAssociations` is cleared by `tauri.windows.conf.json`: Tauri's own associations
would make Orbit the default app for every listed extension.

## The in-app update

1. **Check** (`updater.svelte.ts`, `updater.rs`): about 30 s after start and then every 6 hours, unless
   *Check for updates automatically* is off; never in dev builds. The endpoint is
   `releases/latest/download/latest.json` on GitHub.
   - A release without `latest.json`, or marked pre-release, is invisible to installed copies.
2. **Notice**: an **Update** pill in the top bar and in the Settings footer. The dialog shows the
   release notes.
3. **Download** with progress (`update_download`, `update-progress`). TLS is the operating system's, so
   corporate proxies with their own root certificates work, and the system proxy is honored.
4. **Before installing**, `update_install` verifies the minisign signature against the public key. Then:
   - `prepareQuit` saves files (or asks), the session and the terminals;
   - `quit_others` snapshots every window and asks the other Orbit processes to quit;
   - the frontend waits until `other_instances` is zero (processes of the same executable).
5. **Install**: the NSIS installer runs passive. The plugin exits Orbit with `std::process::exit`, so its
   `on_before_exit` hook kills the PTYs and leaves the window registry as a normal exit would.
6. **Restart**: a marker (`update-restart.json`, valid 10 minutes) makes the relaunched process reopen
   every window. `startup` reports `updatedTo`, which shows an "updated" notice. The terminals and Claude
   chats come back too, starting from 1.1.0 (1.0 didn't save them).

## Checklist

1. Tests: `npm run check`, `npm run test`, `cargo test`.
2. A release build without signing, to check it compiles and to measure:
   ```bash
   CARGO_TARGET_DIR=<scratch> npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
   ```
3. Update the measurements: Footprint in the README, the version's section in `NOTES.md`. Sizes in
   KiB/MiB: Vite prints base-1000 kB.
4. Bump the six fields, write the version's section in `NOTES.md` with its notes block, and commit.
5. Merge into `main` and push.
6. Run the Release workflow without publish (a dry run), approve it, then download the setup from the run
   and try it over the current version. Locally: the script without `-Publish`.
7. Run it again with publish, and approve it. Locally: with `-Publish`.
8. Check that `releases/latest/download/latest.json` serves the new version. Then record the release in
   `NOTES.md` (date, title, tag, signed sizes) and delete the merged branches.
