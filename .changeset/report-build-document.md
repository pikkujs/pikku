---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric report` now sends the whole `BUILD-REPORT.md` as one anonymous document, with no sign-in and no project. It asks first: the answer is yes or no for this report, or always or never, which is saved on the machine (`~/.fabric/report-consent.json`, or `PIKKU_REPORT`) so the question is not asked again. The per-finding flags, `--stdin`, the local queue and `pikku fabric findings` are gone.
