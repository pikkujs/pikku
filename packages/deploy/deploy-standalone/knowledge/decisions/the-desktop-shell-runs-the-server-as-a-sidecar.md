---
type: decision
title: The desktop shell runs the server as a sidecar, not embedded
description: Tauri spawns the compiled pikku binary and points the webview at its HTTP origin, so cookies, CORS and OAuth behave exactly as they do in a browser
tags: [tauri, desktop, standalone, bun]
---

# The desktop shell runs the server as a sidecar, not embedded

A frontend whose config says `"native": { "bundleServer": true, … }` gets a
`src-tauri/` crate — written by `pikku app native init <name> --bundle-server` —
that ships the compiled binary as an `externalBin`, spawns it at launch, and
opens a window at `http://127.0.0.1:<port>`. `pikku deploy apply --provider
standalone --runtime bun` compiles the server and installs it into the
`binaries/` directory of every such frontend; the config asks for the sidecar,
not a flag on deploy, and any other runtime is refused because only bun
compiles to a single file. The server serves
both the API and the built frontend, so **the UI and the API share one real HTTP
origin**.

That single property is the whole reason for the design. A webview loaded from
`tauri://localhost` is a different origin from the server it talks to, and
everything keyed on `window.location.origin` breaks: cookies stop being
first-party, every request needs CORS, better-auth needs special-casing, and
OAuth redirects have nowhere valid to land. Pointing the webview at the server's
own origin means none of that is true — the app is the same app it is on the
web, and no auth code knows it is running on a desktop.

The user need not write Rust. `lib.rs`, `main.rs`, `tauri.conf.json`,
`Cargo.toml`, `build.rs`, a placeholder icon and a placeholder `ui/` page are
all generated, with the product name and identifier taken from the frontend's
`native` entry. The project is committed and becomes the user's to edit; which
files pikku keeps rewriting afterwards is the CLI's _pikku owns named files and
marked regions of a native project_. (The first generator recorded a hash of
what it wrote and skipped any file that no longer matched — safe, but it meant a
touched `main.rs` could never gain a plugin, which is why it was replaced.)

The sidecar is desktop-only. A phone cannot spawn a bundled server binary, so
`bundleServer` with an Android or iOS platform is refused at generate time.

Two supporting rules fall out of running a real server process:

- **Single instance is load-bearing.** `tauri-plugin-single-instance` focuses the
  existing window instead of launching again. Two shells would mean two
  sidecars: two SQLite writers on one file.
- **The sidecar must not outlive the shell.** Tauri stops it on a clean exit, but
  a hard crash never runs that path, and an orphan holds the database open. The
  shell passes its pid down as
  `PIKKU_PARENT_PID` and the server polls it, exiting when the parent is gone.
  With no such variable set — a terminal, a container — the watch is inert.

The shell also resolves the platform's app-data directory and passes it as
`PIKKU_DATA_DIR`. A double-clicked app has no meaningful working directory, so
that variable is where the SQLite file, uploaded content and runtime state live;
the server reads it in bootstrap, which is the one place `process.env` is
allowed.

**What this rules out:** linking the server into the Rust binary, serving the UI
from `tauri://localhost` or a custom protocol, a second auth path for desktop
builds, and any design where two windows can be open at once.
