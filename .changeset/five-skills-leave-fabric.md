---
'@pikku/skills': patch
---

Add `pikku-a11y`, `pikku-seo`, `pikku-permissions`, `pikku-list-query` and
`pikku-realtime`, which lived in Fabric's sandbox image and are not about Fabric.

None of them needs a sandbox, a console or the `fabric` CLI, so a local project
gets the same guidance the hosted build agent has been getting. `pikku-realtime`
carries the SSE and channel patterns inline rather than pointing at a scaffold
command that only exists inside Fabric.
