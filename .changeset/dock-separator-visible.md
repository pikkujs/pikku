---
'@pikku/console': patch
---

Draw the nav dock's separator. It was a 3.6-gap spacer with `background: none`,
so the zones it divides read as one uninterrupted row — the grouping was there
in the markup and invisible on screen. It is now a 2px pill in the hint colour,
which is the same mark and width the dock's own pull hint already uses, rather
than the 1px hairline that could not hold contrast against blurred glass.
