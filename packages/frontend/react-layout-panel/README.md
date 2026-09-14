# @pikku/react-layout-panel

Viewport-bound React layout primitives: a shell, scrollable panels, a stage, and the
phone's tab bar and sheet.

Two ideas, and everything in the package is one of them:

1. **The shell is exactly one viewport tall and never scrolls.** Panels scroll inside it.
   This is what keeps a stage — a canvas, a map, an editor — sized by the window rather
   than by whatever list happens to be beside it.
2. **On a phone the same panels are shown one at a time, raised from a tab bar.** Not the
   same layout narrowed: a different tree, chosen in JS at one breakpoint.

Deliberately dependency-free beyond React — no component library, no CSS-in-JS, no icon
set, and no i18n. Labels are `ReactNode`, so the application brings its own.

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
