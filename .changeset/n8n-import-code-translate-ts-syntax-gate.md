---
'@pikku/n8n-import': patch
---

Code-node translation now falls back to a throwing stub when the n8n JavaScript is valid JS but not valid TypeScript syntax (octal literals, stray HTML comments), avoiding a hard `tsc` parse failure.
