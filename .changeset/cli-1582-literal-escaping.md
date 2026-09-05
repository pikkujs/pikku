---
'@pikku/cli': patch
---

Escape generated TypeScript string literals correctly. A scope display name, role name or environment name containing a backslash, a newline or an escaped quote produced a file that no longer parsed — or, worse, one that parsed with the value silently corrupted. All of the serializers now share one `tsLiteral` helper.
