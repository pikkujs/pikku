---
'@pikku/core': patch
---

fix(ai-agent): resolve addon-scoped services when generating a tool's approval description. The `approvalDescription` for an addon function ran against a cold per-package services cache and silently fell back to root services, so descriptions reading addon-only services (e.g. a todo store) threw and the approval `reason` never reached the client. It now builds the addon's singleton services the same way the tool's `execute` path does (#971).
