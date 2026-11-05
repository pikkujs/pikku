---
'@pikku/cli': patch
---

`pikku cloud report` is now `pikku report`. Findings are kept in `.pikku/findings` at the checkout root, so filing works from a sandbox, and a failed write warns and exits 0. Logged out, they stay on the computer. Logged in, a yes or always sends them under the account token, so findings are no longer anonymous, and the consent question names the account. See docs/MIGRATION.md.
