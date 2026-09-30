---
type: decision
title: Deploy consumes a built frontend, it does not build one
description: pikku reads an already-built client directory named by a frontends entry; running the frontend's build command is the project's job
tags: [frontend, deploy, standalone, cli]
---

# Deploy consumes a built frontend, it does not build one

A `frontends` entry in `pikku.config.json` names a **directory of built
output** — `dist`, relative to the frontend's `cwd` — not a build to run. The
entry that sets `serve` (`{ "cwd": "web", "dist": "dist", "serve": {} }`) is
the one a server mounts. `pikku deploy` reads that directory. It does not run `vite build`, does
not shell out to a package manager, and fails with a plain error if the
directory is absent rather than trying to produce it.

Building the frontend would mean pikku deciding which package manager runs,
which script name means "build", which workspace the frontend lives in, what
environment variables it needs, and what to do when that build fails inside a
deploy. Every one of those is a project-level answer that pikku would be
guessing at, and guessing wrong is worse than not trying: a deploy that
silently rebuilds can ship output that differs from what the project's own CI
verified. `yarn build && pikku deploy` states the order explicitly and keeps the
two steps independently debuggable.

The ordering constraint that this creates is real and worth naming. The bun path
embeds assets by generating a manifest of static imports, which means the build
sequence is fixed: **frontend build → manifest generation → server bundle →
`bun build --compile`**. A frontend that has not been built yet cannot be
enumerated, so there is no arrangement in which pikku could usefully build it
later.

The same rule is what makes native builds portable. `tauri build` reads the
same `dist`, so CI can build the frontend once, upload `dist/` as an artifact,
and run `tauri build` on a runner per platform without any of them rebuilding
the UI.

**What this rules out:** a build command in a `frontends` entry, and any
deploy step that invokes a package manager on the user's behalf.
