---
'@pikku/console': patch
---

Drop the duplicated title in the addon/API detail panel, and summarise markdown
descriptions on cards.

The panel chrome already renders the addon's display name, and the body opened
with the same string again as a large monospace `Title` — the two sat one above
the other, misaligned against the logo. The body header is now a single line:
the package name beside its provider or official badge.

Card descriptions are clamped to two lines, so an apis.guru entry showed raw
`##` and `[label](url)` in the only two lines it had. `plainSummary` keeps the
first section and strips the markdown syntax, leaving a readable sentence.
