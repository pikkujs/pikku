---
'@pikku/console': patch
---

Hide the "Publish an integration" CTA on a read-only console (e.g. a deployed
stage). Publishing is an authoring action, so it now only shows when the console
is editable.
