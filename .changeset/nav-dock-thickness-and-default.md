---
'@pikku/console': patch
---

fix(nav-dock): one thickness at every edge, and up by default

The dock's tile size was fitted against the window's width when it sat along
the top or bottom and against its height when pinned to a side. On any normal
landscape window those are very different budgets: a 1440×900 window let the
horizontal row keep full-size 54px tiles while the same row down the 900px
height had to shrink to fit, so moving the dock to a side visibly thinned it —
the same object, two sizes, depending on which edge it was resting on. The fit
now uses the shorter window edge whichever way the dock is turned, so the
capsule is exactly as thick along the bottom as it is down the side, and the
horizontal dock loses the height it only had because the window happened to be
wide.

The dock also now starts held open rather than hidden. Left to itself it
reserved no layout and appeared on hover over the card gutter, which is the
right resting state once you know it is there and an empty window if you do
not — the reveal is only worth learning after you have seen what it reveals.
`nav-dock-pinned` still persists per browser, so anyone who puts it away keeps
it away.
