---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

addon-console runs verify over a project (codegen, type-checks, correctness checks) and reads the latest result and a file's type errors (`runVerify`, `getVerifyResults`, `getFileDiagnostics`), behind the `pikku:console:verify` scopes.
