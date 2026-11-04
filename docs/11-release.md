# Release

How a version is numbered, built, signed and published, and how installed copies update themselves.

A release has two platforms (M75): **Windows** (NSIS setup and MSI) and **Linux** (AppImage, `.deb`, `.rpm`,
plus a PKGBUILD for Arch). Each is built on its own system by `scripts/New-Release.ps1`, and
`scripts/Publish-Release.ps1` joins them into one release with one `latest.json`.

There are two ways to publish:
- **from GitHub Actions**, the usual way: the Release workflow builds both platforms on GitHub runners, with
  the signing key kept in the secrets of the `release` environment, and publishes them together. It works from
  any PC, or from the browser, and the key never has to be copied to a PC;
- **locally**, on a PC that has the key: the same scripts in PowerShell 7. A PC builds only its own platform,
  so a complete release from there means collecting the other platform's build first (see
  [Publishing locally](#publishing-locally)).

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
is public. It has two phases:
1. **build**, one job per platform: `windows-latest` and `ubuntu-22.04`. Linux builds on the oldest supported
   Ubuntu on purpose: a binary links against the glibc it was built with, and one built on a rolling
   distribution wouldn't start on Debian 12 or Ubuntu 22.04. Each job runs `New-Release.ps1` and uploads its
   `artifacts/release` (`orbit-X.Y.Z-windows`, `orbit-X.Y.Z-linux`);
2. **release**: downloads both builds and runs `Publish-Release.ps1` on them. It joins the two `latest.json`,
   checks that every format is there, writes the PKGBUILD and, with **publish**, creates the release. It
   needs no secret: only the build jobs see the key.

### Running it

- **From the browser**: Actions → **Release** → **Run workflow**, on `main`. Fill in the title (what comes
  after "Orbit vX.Y.Z — ") and tick **publish** to create the release.
- **From any terminal** with `gh`:

  ```powershell
  gh workflow run release.yml -f title="Room for all your repos"                  # dry run
  gh workflow run release.yml -f title="Room for all your repos" -f publish=true  # GitHub release
  gh run watch                                                                    # follow it
  ```

- **Approve it.** The two build jobs wait until the maintainer approves the `release` environment; one
  approval of the environment releases both. Use **Review deployments → Approve and deploy** on the run page
  (GitHub Mobile shows it too), or a terminal:

  ```powershell
  $run = gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId'
  $envId = gh api repos/caste9612/Orbit/environments/release --jq .id
  gh api -X POST "repos/caste9612/Orbit/actions/runs/$run/pending_deployments" `
    -F "environment_ids[]=$envId" -f state=approved -f comment=ok
  ```

- **Without publish** (the default) it's a **dry run**. It builds and signs both platforms, joins them, and
  keeps exactly what it would publish (installers, signatures, the joined `latest.json`, the PKGBUILD) as the
  artifact `orbit-X.Y.Z-dry-run`, for 14 days. Fetch it with `gh run download <run id>` to check it or to try
  the installers.
- **The sizes** of each signed executable and installer are printed in the summary of its build job.

### What it does

Each build job:
1. Checks out the commit with its whole history.
2. On Linux, installs WebKitGTK 4.1 and the other libraries Tauri builds against (`libwebkit2gtk-4.1-dev`,
   `librsvg2-dev`, `libssl-dev`, `patchelf`, `xdg-utils`).
3. Sets up the tools: Node 24 with `npm ci`, and the latest stable Rust. A cache per platform keeps cargo's
   downloads and `src-tauri/target`; it's written only by this workflow, on `main`.
4. Extracts the notes with `Get-ReleaseNotes.ps1`, before any secret is used: a missing section stops the run
   there.
5. Writes the key from its secret to a temporary file and passes it with `-KeyPath`. The password goes in
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
6. Runs `New-Release.ps1`: the same checks, installers and `latest.json` as a local build of that platform.
7. Deletes the key file, prints the sizes and uploads `artifacts/release`.

The release job then checks out the commit again, extracts the notes, downloads both builds and runs
`Publish-Release.ps1` (with `-Publish` when asked), and uploads what it joined.

- With publish, the release is created by `github-actions[bot]`, with the workflow's own token
  (`contents: write`, on the release job only).
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

`scripts/New-Release.ps1` (PowerShell 7) builds the platform of the PC it runs on, Windows or Linux:

```powershell
./scripts/New-Release.ps1 -Notes (./scripts/Get-ReleaseNotes.ps1)                          # build this platform
./scripts/Publish-Release.ps1 -Dir ./artifacts/release, <the other platform's artifacts/release> `
    -Notes (./scripts/Get-ReleaseNotes.ps1) -Title "…" -Publish                              # join + GitHub release
```

1. **Checks the version** in the six places.
2. **Checks the signing key**, `-KeyPath`, by default `~/.tauri/orbit-updater.key`, kept outside the
   repo:
   - it's password-protected (since 1.0). The script asks for the password without showing it, or
     reads `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
   - it tries the password by signing a test file before compiling, and clears it from the environment
     at the end.
3. **Builds in release** with the signing key, each installer with its `.sig`:
   - Windows: the NSIS setup and the MSI;
   - Linux: the AppImage, the `.deb` and the `.rpm`.
4. **Writes `latest.json`** with this platform's entries only (see below) and copies everything into
   `artifacts/release` (git-ignored).

`scripts/Publish-Release.ps1` then:
1. finds the `latest.json` of each platform in the folders given with `-Dir` (subfolders too, as a
   downloaded workflow artifact has them) and checks they're all of the version in `tauri.conf.json`, with
   the same notes;
2. joins their entries and checks that every one is there: `windows-x86_64`, `-nsis`, `-msi`, `linux-x86_64`,
   `-appimage`, `-deb`, `-rpm`. A release missing a platform would leave that platform's installed copies
   without updates, and their check would fail until a complete release; `-AllowMissing` publishes anyway;
3. copies installers, signatures and the joined `latest.json` into `-OutDir` (default
   `artifacts/release-all`), checking that every signature in `latest.json` is the one of its file;
4. writes the **PKGBUILD** for Arch from `packaging/arch/PKGBUILD`, with the version and the SHA-256 of the
   `.deb` and of `LICENSE` (see [Installers](#installers));
5. **with `-Publish`**, checks that the working tree is clean, the commit is already on GitHub and the
   release doesn't exist yet, then creates it with `gh`: tag `vX.Y.Z` on the current commit, the notes as its
   text, every file of the folder as an asset. `-CheckOnly` runs just these checks.

`New-Release.ps1 -Publish` still exists for a one-platform release: it runs the checks before compiling,
then calls `Publish-Release.ps1`, which refuses a single platform unless `-AllowMissing` is given too.

A plain `npm run tauri build` needs no key: `createUpdaterArtifacts` is set only by the script. On Arch and
its derivatives, linuxdeploy's own `strip` doesn't know the RELR relocation sections of the system libraries
and the AppImage step fails: build there with `NO_STRIP=true` (the Ubuntu runner doesn't need it).

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
| `Orbit_X.Y.Z_x64-setup.exe` (NSIS) | Recommended on Windows. Its hooks (`src-tauri/windows/hooks.nsh`) put Orbit in the **Open with** menu of text, code, image and PDF files without making it their default, and hand back the defaults that pre-1.0 versions took over; `UserChoice` is never touched |
| `Orbit_X.Y.Z_x64_en-US.msi` | Installs Orbit but registers no "Open with" (a WiX fragment with `OpenWithProgids` would be the equivalent) |
| `orbit.exe` (portable) | ~6.8 MiB; ≈0.7 MiB of it is the HTTPS client of the updater |
| `Orbit_X.Y.Z_amd64.AppImage` | Any distribution, nothing to install: it carries GTK and WebKitGTK, hence its size. It updates itself in place, without a password |
| `Orbit_X.Y.Z_amd64.deb` | Debian, Ubuntu and derivatives. Depends on the system's `libwebkit2gtk-4.1-0` and `libgtk-3-0` |
| `Orbit-X.Y.Z-1.x86_64.rpm` | Fedora, openSUSE and derivatives |
| `PKGBUILD` | Arch and derivatives (CachyOS, EndeavourOS, Manjaro): `makepkg -si` in a folder with it repackages the release's `.deb` as the `orbit-bin` package and installs `LICENSE` |

On Windows, `bundle.fileAssociations` is cleared by `tauri.windows.conf.json`: Tauri's own associations
would make Orbit the default app for every listed extension.

On Linux the `.deb`, the `.rpm` and the AppImage share one menu entry, `src-tauri/linux/orbit.desktop`
(`bundle.linux.deb.desktopTemplate`, which Tauri uses for the AppImage too, and `…rpm.desktopTemplate`):
- `Exec=orbit %F`, so **Open with** passes the files, which open in a light window;
- `MimeType=text/plain;` only, as VS Code does. Text and code types are subtypes of `text/plain`, so Orbit
  is offered for all of them, while a type without a default of its own falls back to the default of
  `text/plain`. With a full list (images, PDF, JSON, Markdown…) Orbit became the default of every type that had
  no explicit default: on CachyOS, PDFs moved from Firefox to Orbit, because GIO takes the first registered
  app and `Orbit.desktop` sorts first;
- the *Development* category, keywords, and icons from 32 to 512 px.

The AppImage runs through linuxdeploy's AppRun, whose GTK hook forces `GDK_BACKEND=x11` (Orbit runs under
XWayland on a Wayland session, as Tauri chose for its AppImages) and `GTK_THEME`, and points GTK, GIO and
`XDG_DATA_DIRS` into the AppImage's temporary mount. Orbit undoes all of that for what it starts
(`appimage.rs`, see [Backend](08-backend.md#modules)): another window is started from the `.AppImage` file
itself, and shells, `xdg-open` and new windows get an environment without the mount's paths. The `.deb`, the
`.rpm` and the Arch package run as native Wayland clients.

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
   - the frontend waits until `other_instances` is zero (processes of the same executable on Windows, live
     entries of the window registry elsewhere).
5. **Install**:
   - Windows: the NSIS installer runs passive. The plugin exits Orbit with `std::process::exit`, so its
     `on_before_exit` hook kills the PTYs and leaves the window registry as a normal exit would;
   - Linux (M75): the updater knows from the binary which package it came in. An AppImage is replaced in
     place; a `.deb` or `.rpm` is installed with `dpkg -i` / `rpm -U` through `pkexec`, which asks for the
     administrator password. Then `restart_after_install` kills the PTYs, leaves the registry and starts
     Orbit again from the new file, with the AppImage's paths removed from the environment (`app.restart()`
     would pass on this process's environment, pointing into a mount that disappears with it);
   - **left to the package manager**: the Arch package marks itself in `/usr/share/orbit/package-manager`
     (`dpkg -i` there would mix two package managers), and so does a `.deb` or `.rpm` on a system without
     `dpkg` or `rpm`, or a binary built by hand. `update_check` reports it (`manager`), and the dialog says
     *This copy of Orbit was installed with pacman: update it from there* instead of offering to install.
6. **Restart**: a marker (`update-restart.json`, valid 10 minutes) makes the relaunched process reopen
   every window. `startup` reports `updatedTo`, which shows an "updated" notice. The terminals and Claude
   chats come back too, starting from 1.1.0 (1.0 didn't save them).

## Checklist

1. Tests: `npm run check`, `npm run test`, `cargo test` (on Windows; on Linux too when the change touches it).
2. A release build without signing, to check it compiles and to measure:
   ```bash
   CARGO_TARGET_DIR=<scratch> npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
   ```
3. Update the measurements: Footprint in the README, the version's section in `NOTES.md`. Sizes in
   KiB/MiB: Vite prints base-1000 kB.
4. Bump the six fields, write the version's section in `NOTES.md` with its notes block, and commit.
5. Merge into `main` and push.
6. Run the Release workflow without publish (a dry run), approve it, then download `orbit-X.Y.Z-dry-run` and
   try the installers over the current version: the setup on Windows, the AppImage, `.deb` or PKGBUILD on
   Linux.
7. Run it again with publish, and approve it. Locally: with `-Publish`.
8. Check that `releases/latest/download/latest.json` serves the new version, with all seven entries. Then
   record the release in `NOTES.md` (date, title, tag, signed sizes of both platforms) and delete the merged
   branches.
