import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'developer-details'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch (error) {
    console.warn('developer-details: localStorage unavailable', error)
    return false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Whether technical detail (endpoints, dials, commands, transcripts) is shown.
 * Off by default so a non-developer sees the screen without it; one stored
 * setting for every screen, shared with a host that uses the same key.
 */
export function useDeveloperDetails() {
  const shown = useSyncExternalStore(subscribe, read, () => false)
  const setShown = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off')
    } catch (error) {
      console.warn('developer-details: could not save preference', error)
    }
    listeners.forEach((listener) => listener())
  }, [])
  return { shown, setShown }
}
