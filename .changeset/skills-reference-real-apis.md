---
'@pikku/cli': patch
---

Fix bundled skills that referenced nonexistent APIs/commands (`getSecretJSON`, `pikku tsc`/`prebuild`/`auth`/`create`, `pikku tests`), rewrite pikku-testing onto scenarios, and add a verifier that rejects references to commands/methods that don't exist.
