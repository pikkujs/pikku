---
'@pikku/cli': patch
---

Generated files are written atomically, and unchanged schemas are not rewritten.

`writeFile` truncates before it writes, so anything reading a generated file during codegen can see it empty. That reader is real: `pikku scenario run --spawn` bundles the registers while the dev server it just spawned is regenerating them, and esbuild fails the entire run with `Unexpected end of file in JSON` on whichever schema it caught mid-write. The scenario schema split made this reachable in practice — a project with hundreds of scenario schemas rewrote every one of them on every run, right as the runner was loading the register that imports them.

Codegen now writes to a temp file and renames it into place, so a concurrent reader gets either the previous complete file or the new one. Schema files whose contents are unchanged are not rewritten at all, which removes the window entirely for the common case and stops file watchers waking on output that did not change.
