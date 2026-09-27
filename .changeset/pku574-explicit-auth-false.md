---
'@pikku/inspector': patch
'@pikku/core': patch
'@pikku/skills': patch
---

fix(inspector): an explicit `auth: false` declares an exposed sessionless function public, so PKU574 no longer warns about it

A genuinely public endpoint — a published programme, a health check — had no
honest way to quiet PKU574: the only options were an always-true permission or
`permissionsInBody: true`, both of which claim a gate that does not exist. The
inspector now records `auth` on function meta exactly as written instead of
dropping `false`, and the check treats an explicit `auth: false` as the author
declaring the function public on purpose. A sessionless function that leaves
`auth` out still warns.
