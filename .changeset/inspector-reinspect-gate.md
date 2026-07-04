---
'@pikku/cli': patch
---

Skip redundant inspector re-runs in `pikku all` when nothing inspectable changed

`pikku all` unconditionally re-ran the TypeScript inspector up to 3× per run
(after agents, after workflows, after CLI channel) — the dominant cost of
codegen. writeFileInDir now tracks a generation counter bumped only when a
.ts file is actually written or removed, and getInspectorState skips a
refresh when the generation is unchanged since the last inspection. On a
no-change run codegen now performs a single inspection (~2× faster; more on
CPU-constrained machines like sandboxes).

Watchers (`pikku dev`/`watch`) call the new
`invalidateInspectorState` service before re-running `all`, since user
source edits bypass writeFileInDir and must still force a re-inspection.

Also fixes saveSchemas writing a stub register.gen.ts before every real
write — the stub→full flip made every run look dirty and kept the
re-inspect gate (and file watchers) churning on no-op runs.
