---
'@pikku/cli': patch
---

Rewrite 46 bundled skills' frontmatter descriptions as `>-` folded block scalars so pi.dev's strict `yaml` parser stops silently dropping them (was 15/61 loading, now 61/61); the corpus lint now parses with the same parser.
