---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/inspector': patch
---

`pikku cloud login` registers a git credential helper for the cloud git host, so `git push` to a project's repo there authenticates with your login. `pikku cloud logout` forgets the token and removes the helper. CLI commands can set `hidden: true` to stay out of `--help`.
