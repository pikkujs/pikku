---
type: decision
title: A remote desktop shell bundles nothing
description: --desktop-url produces a window onto an already-deployed server — no sidecar, no binary, no bun requirement — with the window declared in tauri.conf.json rather than opened from Rust
tags: [tauri, desktop, standalone, remote]
---

# A remote desktop shell bundles nothing

`pikku deploy apply --desktop-url https://app.example.com` generates the same
`src-tauri/` crate as the sidecar shell, minus everything that exists to run a
server: no `externalBin`, no `tauri-plugin-shell`, no binary copied into
`binaries/`, and no `--runtime bun` requirement, because there is nothing to
compile. The app is a window onto a server someone else's deploy already put on
the internet.

The window is **declared in `tauri.conf.json`**, not built from Rust. That is
the whole difference in the generated program. A sidecar binds its port at
launch, so its origin is unknown until it says so and only Rust can open the
window; a remote url is known before a line of Rust is written, so `main.rs`
keeps nothing but the single-instance plugin.

The origin rule from
[the sidecar shell](the-desktop-shell-runs-the-server-as-a-sidecar.md) is
unchanged and is why this mode is worth having at all: the webview loads the
real `https://` origin, so cookies are first-party, there is no CORS, and OAuth
redirects land where the server expects. A shell that instead bundled the
frontend and served it from `tauri://localhost` would break every one of those
— which is exactly what "remote origin only" rules out.

The url is validated as `http:` or `https:` at generate time. Anything else
builds a crate that fails at runtime, in a window with no address bar to
diagnose it from.

**What this rules out:** bundling the frontend into the shell, a shell that
falls back to a local server when the remote is unreachable, and mixing the two
modes — a binary and a url together is refused rather than silently shipping a
sidecar nothing starts.
