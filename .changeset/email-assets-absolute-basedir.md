---
"@pikku/core": patch
---

fix(core): read email template assets from the absolute `emailsMeta.src` directly

`getEmailTemplateAssets` passed an absolute `baseDir` (e.g. `/project/emails`) into
`readProjectFile`, which resolves `join(basePath, '..', relativePath)`. Because
`path.join` does not treat an absolute second segment as a root reset, this produced
a non-existent compound path (`/project/packages/functions/project/emails/...`), so
every asset read returned `null` and the email preview reported all source files
(`theme, locale, html, subject, text`) as missing. Read the assets directly via
`readFile(join(baseDir, rel))` instead, which resolves correctly for an absolute
base. Verified live: a previously all-missing preview now renders.
