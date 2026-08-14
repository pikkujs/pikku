---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku update`: report which `@pikku/*` dependencies can move forward, and which peers those versions need.

Reporting only by default. `--update` writes the new ranges into every covered package.json — the project root plus every workspace it declares — and then runs an install with the package manager the project names (`--no-install` to skip). `--update-peers` additionally writes the ranges unsatisfied peers require; it is separate because a peer bump can cross a major of a third-party package.

Peers are read off the version the run lands on rather than the one installed, so an update that needs a companion bump says so before it is applied. Ranges that cannot be substituted into (`workspace:*`, `file:`, unions, x-ranges) are reported and left alone, and a package the registry could not answer for is reported as unresolved rather than current.
