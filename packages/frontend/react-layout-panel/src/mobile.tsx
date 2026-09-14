import { useCallback, useSyncExternalStore, type FC, type ReactNode } from 'react'

/**
 * One breakpoint, defined once, in JS — because the phone layout is a DIFFERENT TREE,
 * not the same tree restyled. Panels beside a stage and panels raised one at a time over
 * it cannot be reconciled by media queries; trying produces two layouts' markup on
 * screen at once, each half-hidden.
 *
 * `shell.css` therefore contains no breakpoint at all. Nothing to keep in sync.
 */
export const MOBILE_QUERY = '(max-width: 48em)'

/** Just the slice of `window` the media-query helpers read, so a test can stand in. */
export type MediaQueryTarget = Pick<Window, 'matchMedia'>

/** Whether `query` currently matches — the client's source of truth. */
export function mediaQueryMatches(
  query: string,
  target: MediaQueryTarget = window
): boolean {
  return target.matchMedia(query).matches
}

/**
 * Subscribe to a media query's changes and return the unsubscribe. Named and
 * exported rather than inlined into the hook so the listener wiring can be tested
 * without a DOM.
 */
export function subscribeMediaQuery(
  query: string,
  onChange: () => void,
  target: MediaQueryTarget = window
): () => void {
  const mql = target.matchMedia(query)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * `useSyncExternalStore` rather than an effect: the server has no viewport, so it
 * answers `false` and the client corrects it during hydration instead of after it —
 * which is the difference between a layout shift and a hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => subscribeMediaQuery(query, onChange),
      [query]
    ),
    () => mediaQueryMatches(query),
    () => false
  )
}

export function usePhone(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

export interface ShellTab {
  key: string
  icon: ReactNode
  label: ReactNode
  active?: boolean
  onSelect: () => void
  /** A dot on the icon: something is waiting behind this tab. */
  indicator?: boolean
  /**
   * Render the tab as a link rather than a button.
   *
   * The shell has no router and does not want one. This gives a tab that goes
   * somewhere the semantics of actually going there — a real `href` to copy, a status
   * bar that says where it leads, assistive tech that calls it a link — while an
   * ordinary click is still handed to `onSelect` so the application can route it
   * without a page load. Modified clicks are left alone, so open-in-new-tab works.
   */
  href?: string
  /**
   * This tab is where you ARE, not a control that is held in.
   *
   * `aria-current="page"` and `aria-pressed` are different claims, and a screen reader
   * announces them differently. A destination that says "pressed" tells the user they
   * have toggled something on, which is not what tapping it did.
   */
  destination?: boolean
}

/**
 * Whether a click on a tab's `href` is ours to route, rather than one the browser
 * should handle itself.
 *
 * Everything the browser does better than a router — new tab, new window,
 * download, the middle button — is left to the browser. Only a plain left click is
 * intercepted, so `preventDefault` and the in-app `onSelect` are this component's.
 */
export function shouldFollowLinkInRouter(event: {
  defaultPrevented: boolean
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button: number
}): boolean {
  return (
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  )
}

export interface TabBarProps {
  tabs: ShellTab[]
  /**
   * Names the landmark. A page with more than one `<nav>` in it gives a screen-reader
   * user a list of identical "navigation" entries to choose between, so the bar says
   * which one it is — in the application's own language, which is why it is a prop and
   * not a string in here.
   */
  label?: string
  testId?: string
}

/**
 * The phone's navigation. Five tabs is the ceiling — below that the labels stop being
 * legible on a 320px screen, and a tab whose label is elided is a mystery button.
 */
export const TabBar: FC<TabBarProps> = ({ tabs, label, testId }) => (
  <nav className="pk-tabbar" aria-label={label} data-testid={testId}>
    {tabs.map((tab) => {
      const className = ['pk-tab', tab.active ? 'pk-tab--active' : ''].filter(Boolean).join(' ')
      const body = (
        <>
          <span style={{ position: 'relative', display: 'flex' }}>
            {tab.icon}
            {tab.indicator && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  insetInlineEnd: -3,
                  top: -2,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--shell-accent)',
                }}
              />
            )}
          </span>
          <span className="pk-tab-label">{tab.label}</span>
        </>
      )

      return tab.href === undefined ? (
        <button
          key={tab.key}
          type="button"
          className={className}
          onClick={tab.onSelect}
          aria-pressed={tab.destination ? undefined : Boolean(tab.active)}
          aria-current={tab.destination && tab.active ? 'page' : undefined}
          data-testid={`shell-tab-${tab.key}`}
        >
          {body}
        </button>
      ) : (
        <a
          key={tab.key}
          href={tab.href}
          className={className}
          aria-current={tab.destination !== false && tab.active ? 'page' : undefined}
          data-testid={`shell-tab-${tab.key}`}
          onClick={(e) => {
            if (!shouldFollowLinkInRouter(e)) return
            e.preventDefault()
            tab.onSelect()
          }}
        >
          {body}
        </a>
      )
    })}
  </nav>
)
