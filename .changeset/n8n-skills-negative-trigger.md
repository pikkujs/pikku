---
'@pikku/cli': patch
---

docs(skills): add negative-trigger scoping to the two n8n skills

`pikku-n8n-addon-map` and `pikku-n8n-code-translate` were the only
non-deprecated skills whose descriptions had no "DO NOT TRIGGER when:"
clause, so an agent could load the wrong one (or load either for plain
hand-written code). Each description now scopes itself out of the other's
territory: integration/service stubs → addon-map, Code node stubs →
code-translate, and neither fires when no n8n-generated stub is involved.
