---
'@pikku/skills': patch
---

Truth pass over the corpus and snippet-backed code fences.

Phantom names removed: `pikku-verify` (16 hits across 10 skills — no such
command; the real check is `pikku all`), `pikku-workflow-view`,
`pikku-queue`/`pikku-schedule` in routing prose, and the `pikku-meta`/`pikku-db`
tool spellings in `pikku-fabric`. Stale facts corrected in `pikku-scenario`
(personas live in `definePersonas`, not `pikku.config.json`; `--no-browser` does
not exist), `pikku-workflow` (generated HTTP routes, not `workflowStart`),
`pikku-realtime` (`pikku enable events` is required), and `pikku-fabric`
(`pikkufabric.config.json`, `-y` does not approve destructive migrations).

Code fences can now be generated from compiled code: a fence marked
```` ```ts snippet:<region> ```` is expanded at embed time from the
`// @snippet start <region>` regions in `examples/online-shop`, the same source
the website's code blocks use. `SKILL_SNIPPETS` ships with the package so a
filesystem read (`pikku skills install` from a checkout) expands the same way.
The corpus suite fails on a fence naming a region that does not exist, a CLI
suite fails when the embedded snippets drift from the example, and a ratchet
pins the number of TypeScript fences still unbacked (`73`). `pikku-scenario`'s
persona declaration is the first converted block.
