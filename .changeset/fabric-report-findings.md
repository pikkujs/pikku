---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric report` sends a finding — something about pikku that cost an agent time — to the linked fabric project. Nothing is written to the repo: there is no local queue to go stale, and the terminal prints exactly what left the machine. Reporting never fails a build, so an unreachable endpoint, an unlinked project or a logged-out user prints a line and moves on.

The resolved `@pikku/*` versions are read off the installed tree rather than out of `package.json`, since a range says nothing about what actually ran. A skewed tree and a package resolving through a workspace or link are both flagged, because either is a reason to read the finding differently.

The `pikku-feature` skill now tells an agent when to file one: work around it first, investigate only when there is no workaround, report at the depth already reached, and never patch pikku itself from inside a project that is using it.
