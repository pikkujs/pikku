---
'@pikku/mantine': patch
'@pikku/code-edit': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

The Mantine component catalog moves into pikku. `@pikku/mantine/component-meta` ships per-major prop, variant, size and Styles API metadata for every `@mantine/core` component (regenerate with `generate:component-meta`), and `@pikku/mantine/blocks` ships 133 ready-made, i18n-safe page sections converted to `@pikku/mantine` + Paraglide + lucide (sources in `blocks/`, bundled with `generate:blocks`). `@pikku/code-edit/mantine` reads both through the app's own install and merges the active theme's custom variants. New `pikku components list|show` and `pikku blocks list|show [--out]` commands, and `getComponentMeta`, `getMantineComponents`, `listBlocks` and `getBlock` console RPCs under `pikku:console:design:read`.
