---
'@pikku/skills': patch
---

A site plan for a site that itself sells through Stripe wires `@pikku/addon-commerce-stripe` for one-off purchases instead of designing its own cart, orders and checkout, keeps the existing checkout until the owner has connected Stripe, and depends on a release of the addon that declares its tables in `db/tables.ts`; Stripe seen only inside another provider's embed keeps that provider, and recurring payments are an open question naming better-auth's Stripe plugin.
