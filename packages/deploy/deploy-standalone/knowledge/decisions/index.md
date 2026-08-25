---
type: overview
title: Decisions
description: What "a standalone unit with a UI" does and does not mean
---

# Decisions

<!-- pikku:knowledge-index -->
- [A pikku server serves a static frontend, not a rendered one](a-pikku-server-serves-a-static-frontend.md) — The frontend is TanStack Start built to static output and served through a static mount; pikku never runs a framework renderer in-process
- [Deploy consumes a built frontend, it does not build one](deploy-consumes-a-built-frontend.md) — pikku reads an already-built client directory named by the frontend config key; running the frontend's build command is the project's job
- [Standalone assets are embedded in the bun binary](standalone-assets-are-embedded-in-the-bun-binary.md) — A generated manifest of `with { type: 'file' }` imports puts the frontend inside the compiled binary; the imports must be static literals, which fixes the build order
<!-- /pikku:knowledge-index -->
