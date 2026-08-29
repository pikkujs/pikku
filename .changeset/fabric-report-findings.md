---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric report` sends a finding — something about pikku that cost an agent time — to the linked fabric project. Nothing is written to the repo, so nothing goes stale on an abandoned branch, and the terminal prints exactly what left the machine. Reporting never fails a build.

A finding that cannot be sent is held in `~/.fabric/findings` rather than dropped: logged out, unlinked, or fabric unreachable are the states a finding is most likely to be describing, and a scaffold that never got far enough to log in is exactly the thing worth hearing about. The queue drains on the next report that succeeds, keeps the project each finding was filed against, and is bounded at 100. `pikku fabric findings list`, `flush` and `clear` inspect and control it.

The resolved `@pikku/*` versions are read off the installed tree rather than out of `package.json`, since a range says nothing about what actually ran. A skewed tree and a package resolving through a workspace or link are both flagged, because either is a reason to read the finding differently.

The `pikku-feature` skill now tells an agent when to file one: work around it first, investigate only when there is no workaround, report at the depth already reached, and never patch pikku itself from inside a project that is using it.
