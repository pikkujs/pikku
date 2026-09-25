---
'@pikku/core': patch
---

A virtual user run refused for an unknown or acted-upon persona now answers 400, and one refused for a probing disposition in production answers 403, carrying the reason instead of a bare 500 errorId.
