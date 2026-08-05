---
'@pikku/console': patch
---

`ShellHeader` dropped the title before the count when the text stack did not
fit. The count slot carries a description on some pages, so a header with a
52px page name and a 657px description would shed the name and keep the
sentence, leaving the page anonymous. The text stack still collapses ahead of
any control, but within it the title now outlives the count: full stack →
title only → count only → neither.
