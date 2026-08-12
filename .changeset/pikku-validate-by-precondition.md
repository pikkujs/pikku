---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku workspace validate` is now `pikku validate`, and it checks addon packaging

The command no longer needs to be told what kind of project it is looking at.
Each check declares the condition under which it means anything and runs
wherever that condition holds, so a repo that is an app, a pile of publishable
addons, or both gets exactly the checks that apply — and a run that found
nothing to check says so instead of printing a tick.

The new checks are for addons, and both state the same property at a different
level: every relative import in a shipped generated file, and every `exports` or
`imports` target, must resolve to a file the package actually publishes.

That property was false in every published `@pikku/addon-*`. They shipped
`dist/.pikku` without the `types/application-types.d.ts` those files import —
14 typecheck errors inside `node_modules` for any app depending on one — and
they published a second, dead copy of `.pikku` at the root whose imports reached
for a `src/` and `types/` the tarball did not contain, behind the very subpath
consumers import their bootstrap through.

Addons now point every entry point at the built copy under `dist`; the addon's
own build resolves `#pikku` through tsconfig `paths`, so nothing has to reach
into the source tree. `pikku new-addon` scaffolds that shape, and the addon
skill teaches it.
