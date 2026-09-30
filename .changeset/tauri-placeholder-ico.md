---
'@pikku/deploy-standalone': patch
---

A generated native project packages on Windows: it ships a placeholder `icons/icon.ico` beside `icon.png` and lists both, where the Windows bundler refused to run with `Couldn't find a .ico icon`.
