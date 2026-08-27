---
type: decision
title: Deploy consumes a built frontend, it does not build one
description: pikku reads an already-built client directory named by the frontend config key; running the frontend's build command is the project's job
tags: [frontend, deploy, standalone, cli]
---

# Deploy consumes a built frontend, it does not build one

`frontend` in `pikku.config.json` names a **directory of built output** —
`{ dir: './web/dist', urlPrefix: '/', spaFallback: true }` — not a project to
build. `pikku deploy` reads that directory. It does not run `vite build`, does
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

**What this rules out:** a `frontend.build` command in the config, and any
deploy step that invokes a package manager on the user's behalf.
