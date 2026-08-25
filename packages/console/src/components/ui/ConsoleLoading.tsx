import { createContext, useContext, type ReactNode } from 'react'
import { Center, Loader } from '@pikku/mantine/core'

/**
 * The mark a console screen shows while it waits.
 *
 * A host that embeds the console (Fabric) has a loader of its own, and a
 * Mantine ring in the middle of its page is the one place the embedded screen
 * stops looking like the rest of the product. The host supplies its mark once,
 * through `HostConsoleChrome`, rather than every screen taking a prop for it.
 */
const ConsoleLoaderContext = createContext<ReactNode>(null)

export function ConsoleLoaderProvider({
  loader,
  children,
}: {
  loader?: ReactNode
  children: ReactNode
}) {
  return (
    <ConsoleLoaderContext.Provider value={loader ?? null}>
      {children}
    </ConsoleLoaderContext.Provider>
  )
}

/**
 * A screen's waiting state: the host's mark when there is one, a centred
 * Mantine loader when the console stands alone.
 *
 * `h` is the height the centre fills — `100%` inside a page that already has
 * one, `100vh` for a gate that IS the page. `py` is for the sites that sit in a
 * stack with no height to fill, where the mark is spaced rather than centred.
 */
export function ConsoleLoading({
  h = '100%',
  py,
}: {
  h?: string | number
  py?: string | number
}) {
  const loader = useContext(ConsoleLoaderContext)
  return (
    <Center
      h={py ? undefined : h}
      py={py}
      style={py ? undefined : { flex: 1, minWidth: 0, minHeight: 0 }}
    >
      {loader ?? <Loader />}
    </Center>
  )
}
