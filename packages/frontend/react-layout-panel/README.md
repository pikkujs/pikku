# @pikku/react-layout-panel

Viewport-bound React layout primitives: a shell, scrollable panels, a stage, the phone's
tab bar and sheet, and a navigation dock.

Two ideas, and everything in the package is one of them:

1. **The shell is exactly one viewport tall and never scrolls.** Panels scroll inside it.
   This is what keeps a stage — a canvas, a map, an editor — sized by the window rather
   than by whatever list happens to be beside it.
2. **On a phone the same panels are shown one at a time, raised from a tab bar.** Not the
   same layout narrowed: a different tree, chosen in JS at one breakpoint.

The root entry (`.`) is deliberately dependency-free beyond React — no component library,
no CSS-in-JS, no icon set, and no i18n. Labels are `ReactNode`, so the application brings
its own. The dock is a separate subpath entry (`./dock`) because it is heavier. The
package ships ESM only.

## Usage

Import the stylesheet once, then compose the shell:

```tsx
import '@pikku/react-layout-panel/shell.css'
import { Shell, ShellRow, Stage, Panel } from '@pikku/react-layout-panel'

;<Shell>
  <ShellRow>
    <Panel title="Muscles" width={280} collapsed={collapsed} onCollapse={setCollapsed}>
      {muscles}
    </Panel>
    <Stage>{canvas}</Stage>
  </ShellRow>
</Shell>
```

On a phone, render the shell with `phone` and raise a panel's content in a `Sheet` from a
`TabBar` instead. `usePhone()` reads the one breakpoint, and `shell.css` contains no
breakpoint of its own — nothing to keep in sync.

The `--shell-*` tokens read from Mantine's `--mantine-*` variables when they exist and
fall back when they do not, so the package themes correctly inside a Mantine app without
depending on it.

## Navigation dock

`NavDock` is presentational: the application assembles the zones — identity, pinned,
contextual, utility — from its own routes and data, and hands them over. It reads nothing
itself and carries no router. The dock's own strings are a `labels` prop, because the
package has no i18n.

```tsx
import { NavDock, useDockPrefs } from '@pikku/react-layout-panel/dock'

;<NavDock
  labels={{ nav, show, unpin, sections, empty }}
  identity={{ id: 'home', label: 'Home', Icon: HomeIcon }}
  pinned={pinned}
  contextual={contextual}
  utility={utility}
  isActive={(t) => t.match?.some((p) => pathname.startsWith(p)) ?? false}
/>
```

The subpath peer-depends on `@pikku/mantine` and `@mantine/hooks` (both optional for
consumers of the root entry only). It renders the tiles with Mantine's `Menu` and
`Tooltip`, and ships its styles as a CSS module, so the consuming bundler must process CSS
modules (Vite and Next do). Its colours come from the application's `--app-*`, `--pf-*`
and `--safe-*` tokens.
