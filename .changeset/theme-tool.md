---
'@pikku/code-edit': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

The Mantine theme tooling moves into pikku. `@pikku/mantine/theme-spec` builds a Mantine theme from a stored theme spec (`buildTheme`, `themeRegistry`), replacing the copy every template carried. `@pikku/code-edit/theme` holds the curated presets and a `ThemeWorkspace` that lists, creates, switches, applies and edits the themes in `packages/mantine-theme`, re-branding `emails/theme.json` on apply. New `pikku theme list` and `pikku theme apply` commands, and `getThemePresets` and `applyTheme` console RPCs.
