---
'@pikku/console': patch
---

The nav dock is now configurable, and its settings live in the account menu.

**Always visible.** Held open, the dock stops being a thing that appears on
hover and becomes furniture: it publishes the edge it occupies as
`--nav-dock-inset-*`, and the layout pads by it, so the page card stops where
the dock starts instead of running underneath it. Floating, it reserves nothing
and keeps sitting in the card gutter that is already there.

**Location.** The dock can sit on any of the four edges. Flyouts, tooltips and
the arrow key that opens a tile's menu all follow the edge it is on, so nothing
opens off-screen; the fit measurement is per-axis, and the decision to condense
the contextual zone is retaken from scratch on a move, because a row that fitted
along the window's width will not fit along its height.

**Language, appearance and install app** join refresh, impersonate and sign out
in the account tile. Each language is named in itself rather than in the
language you are currently reading — someone who has landed in a locale they
cannot read is exactly the person reaching for that menu. The chosen locale now
persists and applies `lang` and `dir` to the document. Install is offered where
the browser supports it, with the iOS route written out as the two steps Safari
requires, since the browser gives a page no way to perform them.

Submenus and settings are Mantine's own `Menu.Sub`, `Menu.RadioItem` and
`Menu.CheckboxItem`, so a setting carries the `menuitemradio` /
`menuitemcheckbox` role and the `aria-checked` a screen reader announces, and
picking one leaves the menu open.

Two fixes to the page card fall out of the same pass:

- A page header under `host` chrome had no hairline under it. The band that
  draws it was only applied on the self-drawn card, so the divider every panel
  header has was missing from every page header in the shell. That branch was
  also silently dropping `extraBand`.
- The theme gives every `Container` `px: 'xl'` as a default prop, which lands as
  an inline padding that beat `--console-body-gutter` — so the inline gutter was
  36px whatever the chrome said, and an end-edge panel spent 72px of its 450 on
  empty margin. `PageContainer` now states the gutter on the same prop the theme
  does, and an edge panel carries a panel gutter rather than a page one.
