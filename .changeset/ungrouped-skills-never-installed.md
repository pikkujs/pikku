---
'@pikku/skills': patch
---

Give `pikku-architect`, `pikku-build`, `pikku-knowledge` and
`pikku-software-archaeology` an `installGroups`. A skill with none is skipped
whenever any group is requested, so `pikku skills install --core` never
installed these four — including the archaeology skill other tooling documents
as installed by that command.

Also qualify pikku-i18n's "do not wrap `m`" rule: wrapping the namespace is a
real tradeoff (it forgoes per-message tree-shaking) rather than a mistake, and
is worth it when it buys something the gate cannot, such as debug masking.
