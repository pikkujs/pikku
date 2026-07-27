---
'@pikku/console': patch
---

Add stable `data-testid` hooks to the agent playground.

Approval cards, credential cards, tool calls and the composer now expose
testids plus state attributes (`data-approval-state`, `data-credential-state`,
`data-tool-status`, `data-tool-name`, `data-credential-name`), so browser tests
select on structure rather than on rendered English copy — which goes through
the `m` i18n namespace and is not a stable selector. Purely additive: no copy,
markup or behaviour changes.
