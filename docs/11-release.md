# Release

How a version is numbered, built, signed and published, and how installed copies update themselves.

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

## The release script

`scripts/New-Release.ps1` (PowerShell 7) does the whole release:

```powershell
.\scripts\New-Release.ps1 -Notes .\artifacts\notes-X.Y.Z.md -Title "…"            # build only
.\scripts\New-Release.ps1 -Notes .\artifacts\notes-X.Y.Z.md -Title "…" -Publish   # build + GitHub release
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

- **The notes** are a Markdown file in English. They become the release text on GitHub and the "what's
  new" Orbit shows before updating.
- **The key**: back it up. Losing it, or its password, means installed copies can no longer verify new
  versions; recovering takes a new key and a manual reinstall. The public key is in `tauri.conf.json`
  (`plugins.updater.pubkey`).
- A plain `npm run tauri build` needs no key: `createUpdaterArtifacts` is set only by the script.

## Installers

| Artifact | Notes |
|---|---|
| `Orbit_X.Y.Z_x64-setup.exe` (NSIS) | Recommended. Its hooks (`src-tauri/windows/hooks.nsh`) put Orbit in the **Open with** menu of text, code, image and PDF files without making it their default, and hand back the defaults that pre-1.0 versions took over; `UserChoice` is never touched |
| `Orbit_X.Y.Z_x64_en-US.msi` | Installs Orbit but registers no "Open with" (a WiX fragment with `OpenWithProgids` would be the equivalent) |
| `orbit.exe` (portable) | ~6.6 MiB; ≈0.7 MiB of it is the HTTPS client of the updater |

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
3. Update the measurements: Footprint in the README, the release section in `NOTES.md`. Sizes in KiB/MiB:
   Vite prints base-1000 kB.
4. Write the release notes (`artifacts/notes-X.Y.Z.md`), bump the six fields, and commit.
5. Merge into `main` and push.
6. Run the release script without `-Publish`; install the setup over the current version and try it.
7. Run it again with `-Publish`.
8. Record the release in `NOTES.md` (date, title, tag) and delete the merged branches.
