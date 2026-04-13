---
"@pikku/cli": patch
---

Remove deploy-azure and deploy-serverless from CLI hard dependencies. Deploy providers are optional and dynamically imported at runtime. Only keep deploy-cloudflare as the default provider.
