---
'@pikku/skills': patch
---

Offer to mock the screens before building them

`pikku-build` now asks, in §1's single question round, whether the user wants
the main screens drawn as one self-contained HTML page before any milestone is
built. On approval that page becomes source of truth for the screens: the
milestones are read off it, and it doubles as the theme spec.
