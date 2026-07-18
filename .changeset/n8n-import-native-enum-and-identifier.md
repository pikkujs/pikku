---
'@pikku/n8n-import': patch
'@pikku/inspector': patch
---

Fix two type-check failures found by the n8n-import corpus harness:

- **n8n-import**: `graph:sort` / `graph:summarize` fixedCollection rows now emit their enum values (`order`, `operation`) with `as const`, so the generated `input: (ref) => ({...})` matches the addon's `SortInput` / `SummarizeInput` enums instead of widening to `string`.
- **inspector**: `sanitizeTypeName` now prefixes an underscore when the sanitized name starts with a digit, so a workflow named e.g. `"2. Add …"` no longer generates an invalid `import 2__Add… from …` identifier in `pikku-workflow-wirings-meta.gen.ts`.
