---
'@pikku/cli': patch
---

The release baseline is now `pikku.surface.json` (was `surface.pikku.json`). `pikku release init` writes the new name; `release diff` and `release prepare` still read a legacy `surface.pikku.json`, and `prepare` migrates it to the new name.
