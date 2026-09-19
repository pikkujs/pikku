---
'@pikku/console': patch
---

Security: choose several packages and act on them at once

The audit could only be acted on one row at a time, and the remediation slot a
host overrides (`renderRemediation`) reached only the issues lens — the
dependencies lens hardcoded its own button, so a host could not replace the
action on the screen that lists every package. `SecurityPage` did not forward
the slot either, so a host mounting the page had no way to reach it at all.

Dependency rows are now selectable, and one slot — `renderUpgradeAction` —
serves both a single row and a multi-package selection, since a row is a
selection of one. It is forwarded from `SecurityPage` and
`SecurityReportPanel`, and receives the chosen packages together with the
instruction `buildUpgradePrompt` derives from them, so a host that can verify an
upgrade dispatches exactly the text the console would otherwise have handed to
another agent. The default stays as it was for one package — bump package.json
and install — and for a selection offers that prompt to copy.
