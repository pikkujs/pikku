---
'@pikku/inspector-go': patch
---

`wireContributors` is refused with PKU362 when the same package is wired by two calls, or when an entry is a spread, shorthand or computed property that could change the package or contributor list. Before, the second call replaced the first and a spread or shorthand was skipped silently.
