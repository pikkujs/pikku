---
'@pikku/cli': patch
---

Scaffold addon test apps with the workspace protocol when inside a workspace.

`new-addon` generated a test app depending on its parent via `file:..`. Yarn's
`file:` protocol copies the entire parent directory rather than honouring its
`files` field, so the copy includes the parent's own `test/node_modules` —
which already holds a copy. Every install adds another layer. In the pikku
addons repo this reached 20 levels and ~1.4 GiB before `yarn install` failed
outright with `ENAMETOOLONG`, and it made `yarn.lock` nondeterministic because
the `file:` locator checksums changed as the packed contents grew.

The generated dependency is now `workspace:*`, which symlinks the parent
instead of copying it, so the recursion cannot occur.

`workspace:*` only resolves inside a workspace, and `new-addon` can scaffold
anywhere (`dir || config.scaffold?.addonDir || process.cwd()`). The protocol is
therefore chosen by walking up from the target directory for a `package.json`
declaring `workspaces`, falling back to `file:..` when there is none.
