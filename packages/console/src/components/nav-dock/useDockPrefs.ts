import { useLocalStorage } from '@mantine/hooks'

export type DockSide = 'bottom' | 'top' | 'left' | 'right'

export const DOCK_SIDES: DockSide[] = ['bottom', 'top', 'left', 'right']

export const isVerticalDock = (side: DockSide) =>
  side === 'left' || side === 'right'

/**
 * How the user wants the dock to behave, persisted per browser.
 *
 * Deliberately not props: the dock renders itself from these and the menu that
 * changes them lives inside the dock, so threading them through every embedding
 * app would only give each one a chance to disagree with the other. Mantine's
 * `useLocalStorage` broadcasts within the tab, so both call sites move together.
 */
export function useDockPrefs() {
  const [side, setSide] = useLocalStorage<DockSide>({
    key: 'nav-dock-side',
    defaultValue: 'bottom',
    getInitialValueInEffect: false,
  })
  const [alwaysVisible, setAlwaysVisible] = useLocalStorage({
    key: 'nav-dock-pinned',
    defaultValue: false,
    getInitialValueInEffect: false,
  })
  return { side, setSide, alwaysVisible, setAlwaysVisible }
}
