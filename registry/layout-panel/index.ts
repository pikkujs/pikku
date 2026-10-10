/**
 * The application shell: panels, a stage, the phone's tab bar and sheet, and a nav dock.
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
 * The shell is dependency-free beyond React; labels are `ReactNode`, so the application
 * brings its own. Import `./shell.css` once; its `--shell-*` tokens read from the shadcn
 * variables (`--border`, `--background`, `--primary`) and fall back when they are absent.
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
