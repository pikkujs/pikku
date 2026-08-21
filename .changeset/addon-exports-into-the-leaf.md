---
'@pikku/cli': patch
'@pikku/skills': patch
---

Scaffold an addon whose exports point at the leaf its codegen actually writes

`pikku all` roots an addon's generated tree at `.pikku/addon/`, but `pikku new
addon` still wrote the pre-split targets: `./.pikku/*` resolved to
`./dist/.pikku/*` and the internal RPC map to `./dist/.pikku/rpc/...`, neither of
which exists in the published package. The subpaths a consumer writes are
unchanged — only the targets gain the `addon` segment.

The addon manifest reference in the `pikku-addon` skill described the same
package.json one migration further back, with `imports` and `exports` naming the
source tree and `files: ["dist", ".pikku"]` shipping `.ts` files Node cannot
load. It now documents the built layout, and why `imports` and tsconfig `paths`
deliberately point at different trees.

The plain scaffold — no `--secret`, `--oauth` or `--credential` — built its API
service with `new XService(variables)` against a class declaring no constructor,
so `pikku new addon <name>` produced a package that did not typecheck until the
author deleted the argument. Only the authenticating variants take one.
