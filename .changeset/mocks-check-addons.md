---
'@pikku/cli': patch
---

`pikku all` writes `addon/pikku-addons-meta.gen.json` listing each wired addon's functions, and `pikku mocks check` and `pikku validate` accept calls to them instead of reporting "no function". Any call under a remote addon namespace is accepted.
