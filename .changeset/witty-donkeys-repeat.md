---
'@pikku/cli': patch
---

fix(cli): read `pikku audit --outdated` update rows the way bun actually prints them

Two bugs in how `bun outdated` output was turned into the audit report:

- bun annotates the section a dependency comes from in the Package cell —
  `@types/node (dev)`. That annotation was kept as part of the package name, so
  nothing downstream could match on it: the console's "Update dependency" action
  looked for `@types/node (dev)` in package.json and reported it was not a direct
  dependency, and an advisory against a dev dependency never joined to its update
  and so was offered no version to move to. A package depended on from two
  sections was also listed twice.
- `semverLevel` compared major, minor and patch independently, so `2.0.0 → 1.9.9`
  came out as a `minor` update. The console presents `patch` and `minor` as the
  safe one-click bump, so a downgrade could be offered as the reassuring option.
  Components are now compared in order, stopping at the first that differs.
