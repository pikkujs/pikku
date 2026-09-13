---
'@pikku/cli': patch
---

Keep an app's own `staticMounts` when `pikku dev` mounts the console.

`dev` assigned the console's mount over `staticMounts` rather than appending to
it, so a project that serves its own frontend from the same server lost it the
moment the console was present — which is every project, and in the one command
where serving that frontend is the point.
