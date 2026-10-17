---
'@pikku/inspector-go': patch
---

`pikku-inspect` frees the analysis program before generating schemas, so its peak memory no longer includes the analysis checker, the schema program and the Zod conversion process at once. On a mid-sized app the binary's peak fell from about 460 MB to about 270 MB, and to about 60 MB while Zod schemas convert. Output is unchanged.
