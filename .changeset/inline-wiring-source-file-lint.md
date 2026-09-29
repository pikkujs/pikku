---
'@pikku/inspector': patch
---

The services-destructure lint also skips the `helper` wiring functions `ensureFunctionMetadata` synthesizes, alongside the `inline` ones it already skips, and a test pins that an inline wiring function that records a source file is not flagged.
