---
type: decision
title: The desktop shell runs the server as a sidecar, not embedded
description: Tauri spawns the compiled pikku binary and points the webview at its HTTP origin, so cookies, CORS and OAuth behave exactly as they do in a browser
tags: [tauri, desktop, standalone, bun]
---

# The desktop shell runs the server as a sidecar, not embedded

`pikku deploy apply --provider standalone --runtime bun --tauri` generates a
`src-tauri/` crate that ships the compiled binary as an `externalBin`, spawns it
at launch, and opens a window at `http://127.0.0.1:<port>`. The server serves
both the API and the built frontend, so **the UI and the API share one real HTTP
origin**.

That single property is the whole reason for the design. A webview loaded from
`tauri://localhost` is a different origin from the server it talks to, and
everything keyed on `window.location.origin` breaks: cookies stop being
first-party, every request needs CORS, better-auth needs special-casing, and
OAuth redirects have nowhere valid to land. Pointing the webview at the server's
own origin means none of that is true — the app is the same app it is on the
web, and no auth code knows it is running on a desktop.

The user never writes Rust. `main.rs`, `tauri.conf.json`, `Cargo.toml`,
`build.rs`, a placeholder icon and a placeholder frontend directory are all
generated, with the product name and bundle identifier taken from the project
rather than hardcoded. Regenerating is idempotent, and a file the user has since
edited is left alone and reported rather than overwritten — the generator
records a hash of what it wrote, which is the only way to tell "unchanged since
we wrote it" from "the user has taken this over".

Two supporting rules fall out of running a real server process:

- **Single instance is load-bearing.** `tauri-plugin-single-instance` focuses the
  existing window instead of launching again. Two shells would mean two
  sidecars: two SQLite writers on one file, and two independently unlocked keys
  in memory.
- **The sidecar must not outlive the shell.** Tauri stops it on a clean exit, but
  a hard crash never runs that path, and an orphan holds the database open with
  its data key still resident. The shell passes its pid down as
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
