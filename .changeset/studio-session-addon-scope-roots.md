---
'@pikku/cli': patch
---

Under `pikku dev`, the Studio session also holds the root of each scope that the functions of a wired addon require (for example `blog` for `blog:manage`), never `*`, so Studio can use the addons a project wires. This includes cloud workspaces, which run `pikku dev`.
