import { createContext, useContext, useMemo, useState } from 'react'
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
    }),
    [hasOptions, label, host, open]
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
