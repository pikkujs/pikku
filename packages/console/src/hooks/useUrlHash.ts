import { useCallback, useSyncExternalStore } from 'react'

/**
 * The URL fragment, as state.
 *
 * Deliberately not part of the router shim: nothing routes on the fragment, so
 * making every host (Fabric included) implement a `useHash` before the console
 * could remember a selection would buy nothing. Reading `window.location`
 * directly works under every router the console is mounted in.
 *
 * `replaceState` does not fire `hashchange`, so writers publish to the
 * subscribers themselves — otherwise a panel opened by a click would update the
 * URL and leave every reader on this page holding the previous value.
 */
const subscribers = new Set<() => void>()

const notify = () => {
  for (const subscriber of subscribers) subscriber()
}

const subscribe = (onChange: () => void) => {
  subscribers.add(onChange)
  window.addEventListener('hashchange', onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    subscribers.delete(onChange)
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('popstate', onChange)
  }
}

const read = () =>
  typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')

export const setUrlHash = (next: string) => {
  if (typeof window === 'undefined') return
  if (read() === next) return
  const { pathname, search } = window.location
  // Replace rather than push: the URL tracks the selection so it can be copied
  // and reloaded, but a list you are scanning must not fill the back stack.
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${search}${next ? `#${next}` : ''}`
  )
  notify()
}

export const useUrlHash = (): [string, (next: string) => void] => {
  const hash = useSyncExternalStore(subscribe, read, () => '')
  return [hash, useCallback(setUrlHash, [])]
}
