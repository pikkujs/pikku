---
'@pikku/cli': patch
---

Escape workflow and graph node names in the generated workflow type maps

A scenario step name is free-form prose, so an apostrophe in it is ordinary —
and interpolated into a single-quoted key it terminated the string and left the
whole `pikku-workflow-map.gen.d.ts` unparseable. Both map serializers now emit
the key through `JSON.stringify`.
