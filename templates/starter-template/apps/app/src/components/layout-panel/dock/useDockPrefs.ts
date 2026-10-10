import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function useStored<T>(key: string, fallback: T) {
  const raw = useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      window.addEventListener('storage', notify)
      return () => {
        listeners.delete(notify)
        window.removeEventListener('storage', notify)
      }
    },
    () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    () => null
  )
  const value = raw === null ? fallback : readStored(key, fallback)
  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {}
      listeners.forEach((l) => l())
    },
    [key]
  )
  return [value, set] as const
}

export type DockSide = 'bottom' | 'top' | 'left' | 'right'

export const DOCK_SIDES: DockSide[] = ['bottom', 'top', 'left', 'right']

export const isVerticalDock = (side: DockSide) =>
  side === 'left' || side === 'right'

/**
 * Where the dock starts before anyone has moved it: the edge a reader's eye
 * starts from, so left in LTR and right in RTL. Once moved, the stored side wins.
 */
export function defaultDockSide(): DockSide {
  if (typeof document === 'undefined') return 'left'
  return document.documentElement.dir === 'rtl' ? 'right' : 'left'
}

/** Percent of the dock's natural size. */
export const DOCK_SCALE_MIN = 50
export const DOCK_SCALE_MAX = 160
export const DOCK_SCALE_STEP = 5

/**
 * How the user wants the dock to behave, persisted per browser.
 *
 * Deliberately not props: the dock renders itself from these and the menu that
 * changes them lives inside the dock, so threading them through every embedding
 * app would only give each one a chance to disagree with the other. The stored
 * value is shared through a store, so both call sites move together.
 */
export function useDockPrefs() {
  const [side, setSide] = useStored<DockSide>(
    'nav-dock-side',
    defaultDockSide()
  )
  /* Held open until someone says otherwise. A dock that starts hidden is a
     navigation system nobody can see, and the reveal is only worth learning once
     you know there is something to reveal. */
  const [alwaysVisible, setAlwaysVisible] = useStored('nav-dock-pinned', true)
  /* A ceiling, not an override: the fit still shrinks the row to whatever the
     window can hold, so asking for 160% on a narrow laptop simply gets you the
     largest tile that fits. */
  const [scale, setScale] = useStored('nav-dock-scale', 70)
  return { side, setSide, alwaysVisible, setAlwaysVisible, scale, setScale }
}
