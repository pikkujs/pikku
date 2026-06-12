---
"@pikku/auth-js": patch
---

Remove invalid provider registry entries: figma and bitbucket do not exist in @auth/core, and the azure-ad alias is a duplicate of microsoft-entra-id (Auth.js always assigns id: "microsoft-entra-id" regardless of which entry initialises it).
