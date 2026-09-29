---
'@pikku/inspector': patch
---

Schema generation no longer re-walks every source file for each type. ts-json-schema-generator looks each root type up by name by scanning the whole program, so a project with 677 types scanned it 677 times. The inspector now builds that name index once per program. On the e2e project, TS schema generation drops from 8.7s to 0.1s and a cold `pikku all` from 38s to 8s, with identical output.
