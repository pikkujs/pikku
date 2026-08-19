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
  /* Held open until someone says otherwise. A dock that starts hidden is a
     navigation system nobody can see, and the reveal is only worth learning once
     you know there is something to reveal. */
  const [alwaysVisible, setAlwaysVisible] = useLocalStorage({
    key: 'nav-dock-pinned',
    defaultValue: true,
    getInitialValueInEffect: false,
  })
  return { side, setSide, alwaysVisible, setAlwaysVisible }
}
