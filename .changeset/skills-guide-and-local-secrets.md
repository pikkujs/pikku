---
'@pikku/skills': patch
---

New `pikku-guide` skill: how `pikku scenario guide` compiles a user guide from the scenario suite — that the run supplies only the figures and the page supplies every word, what a page must carry to teach the task, page markers, the capture step, `.guide.lock` staleness, `document: false`, and the traps that make a block come out empty or a run refused.

`pikku-build` now sets both local secrets (`BETTER_AUTH_SECRET`, `SCENARIO_ACTOR_SECRET`) in `.env` before the first run, and says why the stack must start through `bun run dev`: a frontend launched on its own has no persona list, so the "Sign in as …" switcher silently disappears, and its dev proxy defaults to `:3000`, so beside another project's server sign-ins reach the wrong API. It also covers `pikkuSessionlessFunc` for public reads, domain tables that collide with Better Auth's `session`, and mounting the switcher on a public homepage. `pikku-scenario` lists the three silent causes of a missing switcher.
