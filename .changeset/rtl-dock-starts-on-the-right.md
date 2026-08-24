---
'@pikku/console': patch
---

Start the nav dock on the right edge in an RTL locale. The dock's default side was `bottom` for everyone, which puts the identity tile — the anchor the rest of the row is read from — at the far end from where an Arabic or Hebrew reader's eye starts. `defaultDockSide()` reads `document.documentElement.dir`, so it is the layout direction that decides, not the locale list. It remains only a default: the dock's own menu moves it, and a stored `nav-dock-side` always wins.

Hosts that mirror direction onto `<html dir>` from an effect will hand this `ltr` on a cold load — set the attribute during render if the first paint matters.
