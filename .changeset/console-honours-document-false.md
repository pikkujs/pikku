---
'@pikku/console': patch
---

The console's scenarios page leaves out a feature that opted out of
documentation, and its knowledge page stops counting orphans as issues to fix.

`pikkuFeature({ document: false })` was honoured by `pikku scenario guide` but
ignored by `buildScenarioDocs`, so a feature that said it was not documentation
still rendered as a page — and the scenarios it named left the ungrouped
bucket. The flag now means the same thing in both: the feature is left out and
the scenarios it names read as ungrouped.

`pikku knowledge validate` reports orphans — code no note describes — at `info`,
keeps them outside `ok` and prints them as their own summary. The console piped
every finding into one "N issues" row, so a clean base was offered a list of
work it did not have. The row now counts only what the gate would fail on.
