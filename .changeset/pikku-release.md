---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku release`: versioned releases from the API surface. `release prepare` diffs the surface against the committed `surface.pikku.json`, bumps `package.json`, prepends a `CHANGELOG.md` section listing the API changes and any `Release-Note:` commit trailers, and records the result in `release.gen.json`. It never commits, tags or pushes — the caller does, with plain git or a platform. The bump comes from the surface diff alone; below 1.0 a breaking change is a minor, and `--go-live` cuts 1.0.0. `release diff` and `release snapshot` replace `pikku semver`, which stays as a deprecated alias. Surface wirings no longer carry `sourceFile`, so a baseline from another checkout no longer reports every route as modified.
