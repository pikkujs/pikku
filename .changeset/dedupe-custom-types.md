---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Generate the custom types once, into `pikku-custom-types.gen.d.ts` in `outDir` (configurable as `customTypesDeclarationFile`), instead of copying them into every typed map. Each map now imports the shared file by a relative path and re-exports each custom type under its old name, so map exports are unchanged. Generated maps no longer contain absolute import paths.
