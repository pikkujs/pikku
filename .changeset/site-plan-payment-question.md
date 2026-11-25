---
'@pikku/cli': patch
'@pikku/skills': patch
---

When the capture shows the site takes payments, the site study asks which payment provider the owner uses, in the same single question as the site's other apps. Stripe is planned on `@pikku/addon-commerce-stripe`, another provider on an existing addon or one generated from its OpenAPI document, and no answer keeps the existing checkout; in every case the existing checkout stays until the owner confirms its replacement.
