---
'@pikku/react-layout-panel': patch
---

Introduces `@pikku/react-layout-panel`, the viewport-bound application shell lifted out of a downstream app so the console and any Pikku app can share one layout. It is dependency-free beyond React: `Shell` / `ShellRow` / `Stage` for the one-viewport-tall frame, `Panel` cards that scroll internally and collapse to a named rail, and the phone's `TabBar` / `Sheet` / `usePhone`. The single breakpoint lives in JS because the phone layout is a different tree, not the same tree restyled. Colours come from `--shell-*` tokens that read Mantine's `--mantine-*` variables when present and fall back when they are not.
