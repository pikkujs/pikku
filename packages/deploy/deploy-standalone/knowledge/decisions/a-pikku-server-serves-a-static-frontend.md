---
type: decision
title: A pikku server serves a static frontend, not a rendered one
description: The frontend is TanStack Start built to static output and served through a static mount; pikku never runs a framework renderer in-process
tags: [frontend, tanstack, static-mounts, standalone]
---

# A pikku server serves a static frontend, not a rendered one

The frontend story is one framework — **TanStack Start** — and one output shape:
static HTML, JS and CSS on disk, served through the same `StaticMount`
machinery that already serves the console. Next.js is out of scope, and so is
running any framework's server renderer inside the pikku process.

Both halves of that are deliberate, and for the same reason. Hosting a renderer
means owning that framework's server contract: its request/response adapter, its
streaming model, its middleware ordering, its version skew. It couples a pikku
release to a frontend framework release, and it multiplies by every runtime we
support — the node server, the bun server, and every serverless adapter would
each need their own integration. A directory of files needs none of that, and
what it costs the app is per-request server rendering, which a local-first
desktop app was never going to use.

The capability is not standalone-specific. `pikku serve` and `pikku dev` mount a
frontend the same way, because a server that can serve its own UI is useful long
before anyone wraps it in Tauri — it is the difference between one origin and
two, which is also the difference between first-party cookies and a CORS
configuration. Standalone is the case that makes it *feel* like an app; it is
not the case that justifies the feature.

Dev does not use a mount at all. Vite serves the frontend and proxies `/api` to
pikku, exactly as `packages/console/vite.config.ts` already does — HMR is the
whole point of dev, and a static mount cannot offer it.

**What this rules out:** a Next.js integration, an in-process SSR or streaming
handler, and a frontend capability that only exists inside `pikku deploy`.
