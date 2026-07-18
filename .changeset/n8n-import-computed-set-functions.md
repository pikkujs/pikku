---
'@pikku/n8n-import': patch
---

Lower Set / Edit Fields nodes with computed fields into real generated functions instead of dropping the field to a `// TODO(n8n expr)` comment, cutting dropped expressions from 1382 to 223.
