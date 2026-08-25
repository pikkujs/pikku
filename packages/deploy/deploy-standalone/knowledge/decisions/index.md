---
type: overview
title: Decisions
description: What "a standalone unit with a UI" does and does not mean, and what a double-clickable build of it is
---

# Decisions

<!-- pikku:knowledge-index -->
- [A pikku server serves a static frontend, not a rendered one](a-pikku-server-serves-a-static-frontend.md) — The frontend is TanStack Start built to static output and served through a static mount; pikku never runs a framework renderer in-process
- [Deploy consumes a built frontend, it does not build one](deploy-consumes-a-built-frontend.md) — pikku reads an already-built client directory named by the frontend config key; running the frontend's build command is the project's job
- [Desktop builds are unsigned and never update themselves](desktop-builds-are-unsigned-and-never-update-themselves.md) — Code signing, notarization and auto-update are deliberately absent from the first version of the Tauri shell — a known limitation, not an oversight
- [Standalone assets are embedded in the bun binary](standalone-assets-are-embedded-in-the-bun-binary.md) — A generated manifest of `with { type: 'file' }` imports puts the frontend inside the compiled binary; the imports must be static literals, which fixes the build order
- [The desktop shell runs the server as a sidecar, not embedded](the-desktop-shell-runs-the-server-as-a-sidecar.md) — Tauri spawns the compiled pikku binary and points the webview at its HTTP origin, so cookies, CORS and OAuth behave exactly as they do in a browser
- [The shell never handles the passphrase](the-shell-never-handles-the-passphrase.md) — The server boots locked and is unlocked by an HTTP call from the frontend; Rust neither prompts for, holds, nor forwards a key
- [The sidecar reports its port; the shell never picks one](the-sidecar-reports-its-port-the-shell-never-picks-one.md) — The server binds :0 and prints the port it got on the ready line; Rust blocks on that line rather than choosing a free port and passing it down
<!-- /pikku:knowledge-index -->
