---
'@pikku/core': patch
---

Carry the wired instance through a `ref('ns:fn')` an app writes. The wiring is
the app's, so the reference arrives with no instance and the function used to
run against the addon's declared secrets alone — the consuming app's
`secretOverrides` and grants silently did not apply, and the app's own global
middleware was denied secrets it owns.
