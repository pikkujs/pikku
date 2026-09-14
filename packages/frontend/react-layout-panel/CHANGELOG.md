# @pikku/react-layout-panel

## 0.1.1

### Patch Changes

- d6842b3: Introduces `@pikku/react-layout-panel`, the viewport-bound application layout lifted out of a downstream app so the console and any Pikku app can share one implementation.

  The root entry is dependency-free beyond React: `Shell` / `ShellRow` / `Stage` for the one-viewport-tall frame, `Panel` cards that scroll internally and collapse to a named rail, and the phone's `TabBar` / `Sheet` / `usePhone`. The single breakpoint lives in JS because the phone layout is a different tree, not the same tree restyled. Colours come from `--shell-*` tokens that read Mantine's `--mantine-*` variables when present and fall back when they are not.

  `@pikku/react-layout-panel/dock` is the navigation dock, a separate subpath entry because it peer-depends on `@pikku/mantine` and `@mantine/hooks`. `NavDock` is presentational — the application assembles the identity, pinned, contextual and utility zones from its own routes and data, and passes its own `labels`, so the package carries no router and no i18n. The console now builds its dock from this instead of a local copy.

  The package ships ESM only: the dock's `@pikku/mantine/core` import is an exports-only subpath that a CommonJS/`node` resolution cannot see.
