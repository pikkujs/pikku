---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku release`: versioned releases with plain git. `release prepare` diffs the surface against the committed `surface.pikku.json`, bumps `package.json`, prepends a `CHANGELOG.md` section and pushes one commit to `release/next`; `release publish` fast-forwards trunk and production to it and tags `vX.Y.Z` in one atomic push. The bump comes from the surface diff alone; a `Release-Note:` commit trailer adds a changelog note. `release diff` and `release snapshot` replace `pikku semver`, which stays as a deprecated alias. Surface wirings no longer carry `sourceFile`, so a baseline from another checkout no longer reports every route as modified.
