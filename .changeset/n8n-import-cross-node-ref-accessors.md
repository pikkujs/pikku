---
'@pikku/n8n-import': patch
---

Lower more n8n cross-node references (`$('X').first().json.<path>`, bare `$('X').json.<path>`, `$node[...].item`) to declarative `ref()`, removing 92 dropped expressions across the corpus.
