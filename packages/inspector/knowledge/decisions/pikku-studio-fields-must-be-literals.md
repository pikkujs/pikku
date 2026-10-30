---
type: decision
title: Every definePlugin field must be a literal, or the build reports a critical error
description: add-pikku-studio reads the manifest and each screen by AST and reports ADDON_SCREENS_NOT_STATIC (PKU345) for a non-literal value, a spread or a value outside a field's allowed set
tags: [inspector, screens, studio, scopes]
---

# Every definePlugin field must be a literal, or the build reports a critical error

`addPikkuStudio` in `packages/inspector/src/add/add-pikku-studio.ts` reads the
manifest `title` and every screen field (`path`, `title`, `scope`, `nav`,
`replaces`, `needsApp`, `layout`, `scopes`, `component`, `app`) from the AST.
`fail` is `logger.critical(ErrorCode.ADDON_SCREENS_NOT_STATIC, message)`
(line 234). A screen's `scopes` goes through `stringArray(value)` and fails
with "A screen's scopes must be an array of string literals" when it returns
nothing (lines 162-169); `component` must be a literal lazy import
(lines 171-176). `scope`, `nav.area` and `layout` must be one of their literal
values. That `needsApp` belongs only on a `'project'` screen is held by the
type (`StudioScreen` in `packages/core/src/wirings/addon/define-plugin.ts`), not
by the inspector.

The Go port (`packages/inspector-go/internal/visit/group_pikku_studio.go`)
reports the same diagnostics; the `wirings-addons` golden covers each one.

**What this rules out:** a screen whose fields come from a variable, a computed
value, a call or a spread. Studio reads the screens from the generated meta, not
by running the addon, so the inspector cannot accept a value it cannot see.
