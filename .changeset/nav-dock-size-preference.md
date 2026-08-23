---
'@pikku/console': patch
---

feat(nav-dock): let the dock's size be a preference

The dock sized itself entirely from the window. One measured tile drove
everything — the glyph, its stroke weight, the gap, the capsule's thickness, the
inset it reserves — and that tile was whatever fitted the shorter window edge,
capped at 54px. On a large display that cap is the only thing in force, so the
dock is the same physical size on a 13" laptop and a 32" monitor, which means it
reads as comfortable on one and tiny on the other. Density is not something the
window can answer; it depends on how far away the person is sitting.

`useDockPrefs` now carries a `scale` percent alongside `side` and
`alwaysVisible`, persisted per browser as `nav-dock-scale` and defaulting to
100. It moves the whole tile band rather than overriding the fit: the loop still
shrinks the row until it fits the window, so asking for 160% on a narrow laptop
gets you the largest tile that will actually hold the full row instead of a
clipped one. The reserved edge inset follows the measured tile as it always has,
so a larger dock takes the space it needs and the page stops where it starts.

The control is a slider, because the answer is a comfortable size rather than
one of four named ones. `FlyoutRow` grows a `slider` variant for it — a row that
draws a track under its label, reports the live value as its hint, and stays
open while you drag, since a menu that closed on release would hide the thing
being sized at the moment you want to look at it. It is a plain element rather
than a `Menu.Item` so the pointer and the arrow keys reach the slider instead of
the menu's roving focus.
