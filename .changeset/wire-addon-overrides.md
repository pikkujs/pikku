---
'@pikku/core': patch
'@pikku/inspector': patch
---

Add `secretOverrides` and `variableOverrides` support to `wireAddon()`. These optional maps allow an app to remap an addon's secret/variable keys to its own names (e.g. `secretOverrides: { SENDGRID_API_KEY: 'MY_EMAIL_API_KEY' }`). The inspector validates that all override keys exist in the app's own secrets/variables definitions.
