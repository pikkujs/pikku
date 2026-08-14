import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { I18nString } from '@pikku/react'

/**
 * The phone home for a page's OPTIONS RAIL — the in-page column of choices that
 * sits beside the body card on a desktop (the sections of a settings screen, a
 * file tree, …). A phone has no room for a second column, and flattening the
 * rail into a horizontal strip only trades the problem for a hidden-overflow
 * one: half the choices sit off-screen behind a scroll nobody sees. So on a
 * phone the rail moves into a bottom sheet reached from its own tab in
 * MobileTabBar, and the page body gets the whole screen.
 *
 * This context is the hand-off. A page declares its rail with PageOptionsPortal
 * (which portals it into the sheet and flips `hasOptions`), the layout renders
 * the sheet, and MobileTabBar shows the tab only while a page has actually
 * registered one — no page-specific knowledge anywhere in the chrome.
 */
/**
 * The one thing the sheet's surface is FOR — starting a new run, composing a new
 * message. On a desktop it is a button inside the panel; in a sheet that button
 * scrolls away with the list under it, so it is lifted out and pinned to the top
 * of the sheet where a thumb lands.
 */
export interface PageAction {
  label: I18nString
  icon?: React.ReactNode
  onSelect: () => void
}

interface PageOptionsContextValue {
  /** Whether the page currently on screen registered an options rail. */
  hasOptions: boolean
  setHasOptions: (has: boolean) => void
  /** What the tab is called for THIS page. A rail of mixed choices is "Options";
   *  a rail that is one named thing (a file tree) says so, since a tab labelled
   *  for its content is what tells the user it is worth tapping. Null falls back
   *  to the generic label. */
  label: I18nString | null
  setLabel: (label: I18nString | null) => void
  /** The sheet's body element, once mounted — PageOptionsPortal's target. */
  host: HTMLElement | null
  setHost: (host: HTMLElement | null) => void
  open: boolean
  setOpen: (open: boolean) => void
  /** The surface's primary action, pinned above the sheet body. */
  action: PageAction | null
  setAction: (action: PageAction | null) => void
}

const PageOptionsContext = createContext<PageOptionsContextValue | null>(null)

export function PageOptionsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [hasOptions, setHasOptions] = useState(false)
  const [label, setLabel] = useState<I18nString | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<PageAction | null>(null)

  const value = useMemo(
    () => ({
      hasOptions,
      setHasOptions,
      label,
      setLabel,
      host,
      setHost,
      open,
      setOpen,
      action,
      setAction,
    }),
    [hasOptions, label, host, open, action]
  )

  return (
    <PageOptionsContext.Provider value={value}>
      {children}
    </PageOptionsContext.Provider>
  )
}

export function usePageOptions(): PageOptionsContextValue {
  const ctx = useContext(PageOptionsContext)
  if (!ctx)
    throw new Error('usePageOptions must be used inside PageOptionsProvider')
  return ctx
}

/**
 * Puts the sheet away. Call it from the surface's own select handler: on a phone
 * the thing the user just picked is UNDER the sheet they picked it in, so a sheet
 * that stays up hides the answer to the tap.
 *
 * A no-op on a desktop, and outside the provider — the panels that call it also
 * render in hosts that mount no phone chrome at all (a standalone render
 * harness), and a hook that threw there would make the phone path a liability.
 */
export function usePageOptionsDismiss(): () => void {
  const ctx = useContext(PageOptionsContext)
  const setOpen = ctx?.setOpen
  return useMemo(() => () => setOpen?.(false), [setOpen])
}

/**
 * Declares the surface's primary action while this component is mounted. Same
 * hand-off as PageOptionsPortal: the panel says what its action is, the chrome
 * decides where an action goes.
 *
 * `icon` deliberately does not key the registration — it is written inline at
 * every call site, so a new element each render would re-register forever.
 */
export function usePageAction(action: PageAction | null) {
  const ctx = useContext(PageOptionsContext)
  const setAction = ctx?.setAction
  const label = action?.label ?? null
  const onSelect = action?.onSelect ?? null
  const icon = useRef(action?.icon)
  icon.current = action?.icon

  useEffect(() => {
    if (!setAction) return
    if (!label || !onSelect) {
      setAction(null)
      return
    }
    setAction({ label, icon: icon.current, onSelect })
    return () => setAction(null)
  }, [setAction, label, onSelect])
}
