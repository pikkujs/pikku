---
'@pikku/addon-console': patch
'@pikku/console': patch
---

Find the package manager at the workspace root, and stop the impersonation banner covering the page

Installing an addon from the console detected the package manager by looking
only in the pikku root — the directory holding `pikku.config.json`. In a
monorepo that is a package directory carrying neither a `packageManager` field
nor a lockfile, so detection fell through to its `npm` default and ran
`npm install` inside a yarn workspace, which dies on
`Unsupported URL Type "workspace:"`. Detection now walks up to the workspace
root, where both signals actually live, and a declared manager anywhere up the
tree outranks a lockfile below it — a stray `package-lock.json` in a
sub-package no longer overrides the root's declared yarn.

The impersonation banner is fixed to the top of the window but reserved no
space, so it painted over the top ~34px of every page and swallowed clicks on
anything the page put there. It now publishes its measured height as
`--app-banner-inset-top` and the app layout pads by it, following the same
idiom the nav dock already uses for the edges it takes.
