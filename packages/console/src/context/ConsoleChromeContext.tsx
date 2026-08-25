import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import classes from '../components/ui/console.module.css'
import { ConsoleLoaderProvider } from '../components/ui/ConsoleLoading'

/**
 * Who draws the chrome around a console screen.
 *
 * `self` (the default) is the standalone console: each screen paints its own
 * list surface and docks the detail panel as a column inside itself.
 *
 * `host` is an embedded console — a platform such as Fabric that already puts
 * every screen inside its own page card and has its own end-edge panel. There,
 * the screen's surfaces are that card's CONTENT, so they drop their border,
 * radius, background and page padding, and the layout leaves the detail panel
 * to the host: the host mounts the panel context and renders `PanelContainer`
 * beside the page rather than welded inside it.
 */
export type ConsoleChrome = 'self' | 'host'

export const ConsoleChromeContext = createContext<ConsoleChrome>('self')

export function useConsoleChrome(): ConsoleChrome {
  return useContext(ConsoleChromeContext)
}

/**
 * The class for a screen's OUTERMOST list surface — a card of its own when the
 * console draws its own chrome, flush when the host already drew that card.
 *
 * Only for the outermost surface: the panes inside a two-pane layout are
 * siblings that read as separate panes because of their borders, so they keep
 * `listSurfaceCard` in both modes.
 */
export function useListSurfaceClass(): string {
  return useConsoleChrome() === 'host'
    ? classes.listSurfaceFlush
    : classes.listSurfaceCard
}

/**
 * Declares that the host owns the card and the detail panel.
 *
 * `chromeHost` retunes `--console-body-gutter` for everything inside — see
 * console.module.css. The data attribute is not read by the console itself — it
 * is a hook for the host's own stylesheet, which may need to reach inside the
 * embedded screen.
 *
 * `loader` is the mark every screen inside shows while it waits, so an embedded
 * console waits the way the rest of the host's product does.
 */
export function HostConsoleChrome({
  children,
  loader,
}: {
  children: ReactNode
  loader?: ReactNode
}) {
  return (
    <ConsoleChromeContext.Provider value="host">
      <ConsoleLoaderProvider loader={loader}>
        <div
          data-console-chrome="host"
          className={`${classes.flexColumn} ${classes.chromeHost}`}
          style={{ flex: 1, minWidth: 0, minHeight: 0 }}
        >
          {children}
        </div>
      </ConsoleLoaderProvider>
    </ConsoleChromeContext.Provider>
  )
}
