/**
 * The navigation dock — a fixed overlay that reserves no layout and appears when
 * the pointer reaches the edge it is pinned to.
 *
 * `NavDock` is presentational: it draws whatever zones it is handed, so an app
 * assembles its own model from its routes and data and gets the same row. This is
 * a subpath export because the dock (`@pikku/mantine`, `@mantine/hooks`) is
 * heavier than the dependency-free shell at the package root.
 */
export { NavDock, type NavDockProps, type DockLabels } from './NavDock.js'
export { DockFlyout } from './DockFlyout.js'
export {
  DOCK_SCALE_MAX,
  DOCK_SCALE_MIN,
  DOCK_SCALE_STEP,
  DOCK_SIDES,
  defaultDockSide,
  isVerticalDock,
  useDockPrefs,
  type DockSide,
} from './useDockPrefs.js'
export { isSep } from './model.js'
export type {
  DockBadge,
  DockEntry,
  DockEnv,
  DockMenu,
  DockTile,
  FlyoutRow,
  FlyoutSection,
  IconComponent,
} from './model.js'
