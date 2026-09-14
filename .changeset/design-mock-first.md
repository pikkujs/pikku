---
'@pikku/skills': patch
---

Offer to mock the screens before building them

`pikku-build` now asks, in §1's single question round, whether the user wants
the main screens drawn as one self-contained HTML page before any milestone is
built. The theme is authored first and the mock drawn from its values, so
approving the mock approves what actually ships; the page then becomes source of
truth for the screens and the milestones are read off it.
