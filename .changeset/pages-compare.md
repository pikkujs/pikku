---
'@pikku/cli': patch
'@pikku/playwright': patch
'@pikku/skills': patch
---

`pikku ui pages compare --reference <dir> --baseUrl <url>` compares a frontend's pages with reference screenshots named `<id>-<width>.jpg|png` (a pikku-site-clone capture): each page is photographed at each width found in the reference (or `--widths`), both images are scaled to one width and aligned at the top, and `<id>-<width>.diff.png` (reference | changed pixels in red | ours) and `report.json` are written to `--out` (default `<outDir>/pages/compare/<app>`). It reports the changed-pixel share, the page heights and their difference, and, where the reference has a `<id>-<width>.layout.json`, the capture script's section differences, worst first. A reference page with no route (index is `/`, `<id>` is `/<id>`, or `map.json`/`--map`) or a 404 is MISSING. `--threshold <percent>` exits non-zero when a page is over it or missing. Images are decoded with `pngjs` and `jpeg-js`. `screenshotPages` takes a `width` and an `inspect(page)` hook.
