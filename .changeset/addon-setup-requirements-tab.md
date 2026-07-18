---
'@pikku/console': patch
---

Add a "Setup" tab to the installed-addon detail that surfaces what the addon
needs before it runs: its OAuth integrations (connect / connected status) and
its secrets (set / not-set status), each with an inline connect or set action.
The tab is the default view for an addon that has requirements, so opening a
freshly added addon shows what still needs configuring. Status comes from
`console:credentialStatus` (OAuth) and `pikkuConsoleGetSecret` (secrets);
connecting reuses the admin-gated `/credential-oauth/link` redirect flow.
