---
"@pikku/console": patch
---

fix(console): use the shared ResizablePanelLayout + ListPageHeader for the selected-template email view instead of a bespoke flexColumn/100vh shell, so it gets the standard page header (and headerRight action) and fills its container when embedded
