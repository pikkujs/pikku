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

The new check is for addons: every relative import in a shipped generated file
must resolve to a file that is itself shipped. That property was false in all
217 published `@pikku/addon-*` packages, which shipped `dist/.pikku` without the
`types/application-types.d.ts` those files import — worth 14 typecheck errors
inside `node_modules` for any app that depended on one.
