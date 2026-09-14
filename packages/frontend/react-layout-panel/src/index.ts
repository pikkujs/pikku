/**
 * @pikku/react-layout-panel — the application shell the Pikku console is built out of,
 * extracted so an app can have the same one.
 *
 * Two ideas, and everything here is one of them:
 *
 *   1. The shell is exactly one viewport tall and never scrolls. Panels scroll inside
 *      it. This is what keeps a stage — a canvas, a map, an editor — sized by the window
 *      rather than by whatever list happens to be beside it.
 *
 *   2. On a phone the same panels are shown one at a time, raised from a tab bar. Not
 *      the same layout narrowed: a different tree, chosen in JS at one breakpoint.
 *
 * Deliberately dependency-free beyond React — no component library, no CSS-in-JS, no
 * icon set, and no i18n. Labels are `ReactNode`, so the application brings its own.
 * Import `@pikku/react-layout-panel/shell.css` once; its `--shell-*` tokens read from
 * Mantine's `--mantine-*` variables when they exist and fall back when they do not.
 */
export { Shell, type ShellProps } from './Shell.js'
export { ShellRow, type ShellRowProps } from './ShellRow.js'
export { Stage, type StageProps } from './Stage.js'
export { Panel, type PanelProps, type PanelSide } from './Panel.js'
export { Sheet, type SheetProps } from './Sheet.js'
export {
  TabBar,
  type TabBarProps,
  type ShellTab,
  usePhone,
  useMediaQuery,
  MOBILE_QUERY,
} from './mobile.js'
