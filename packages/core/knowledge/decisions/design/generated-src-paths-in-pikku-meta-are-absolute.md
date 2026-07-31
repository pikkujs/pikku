---
type: decision
title: Generated src paths in pikku meta are absolute
description: emailsMeta.src is resolved by the CLI at generation time, so reading through the project-relative helpers produces a wrong compound path
tags: services
---

# Generated src paths in pikku meta are absolute

`emailsMeta.src` is written by the CLI at generation time and is already an
absolute filesystem path. `LocalMetaService.getEmailTemplateAssets`
(`packages/core/src/services/meta-service.ts`) therefore calls `readFile` on
`join(baseDir, rel)` directly instead of going through its own
`readProjectFile`, which is the helper every other read in that class uses.

`readProjectFile` prepends the project root (`join(basePath, '..', relativePath)`).
Handing it an already-absolute `src` yields a compound path that points nowhere,
and the failure is silent — the helpers return `null` on a missing file, so the
symptom is a template that reports itself as having no assets rather than an
error naming the path.

**What this rules out:** routing the email asset reads through `readProjectFile`
or `readFile` "for consistency", and assuming that any `src` field appearing in a
`.gen.json` is relative to the project. If a remote `MetaService` ever needs to
serve these assets, it has to translate the absolute path rather than pass it
through.
