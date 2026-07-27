---
'@pikku/console': patch
---

Make the auth providers page and the console gate addressable from a test without reading translated copy back. Each provider row carries `data-provider`, and its status is a single `auth-provider-status` element carrying `data-configured` — so "not configured" is an asserted state rather than a missing badge, which an unrendered row would also satisfy. The not-authorized screen and the credential connections surface carry test ids, and the page header's view switch tags each option with its value.

The badge and plugin labels move from `asI18n` string literals onto `messages/en.json` keys, so they translate with the rest of the console.
