import { useEffect, useRef } from 'react'
import { Drawer } from '@pikku/mantine/core'

interface OpenSheet {
  opened: boolean
  close: () => void
}

/**
 * Every mounted sheet, so raising one can put the others away. A module
 * singleton rather than a context because "one bottom sheet on screen" is an
 * app-wide invariant with exactly one instance — the same shape Mantine's own
 * `spotlight` store uses, and it keeps the rule inside the component that owns
 * it instead of a provider every caller has to be wrapped in.
 */
const sheets = new Set<OpenSheet>()

/**
 * Puts away whatever sheet is currently up. For the tab-bar surfaces this
 * happens on its own — opening one closes the rest — but Search raises a
 * Spotlight rather than a sheet, so it has to clear the foot itself.
 */
export function closeMobileSheets() {
  for (const sheet of sheets) if (sheet.opened) sheet.close()
}

/**
 * The ONE way a phone surfaces anything the bottom tab bar opens: nav, the
 * page's options rail, search. Each of those used to arrive differently — nav
 * slid in from the left, options rose from the foot, search was a centred modal
 * — which read as three unrelated mechanisms sharing one bar. They are the same
 * gesture (tap a tab, get a temporary surface over the page), so they get the
 * same motion: up from the tab you tapped.
 *
 * Every sheet stops at `--mobile-tabbar-foot` so the bar that opened it stays
 * reachable — tapping the same tab is how you put a sheet away, and a sheet
 * covering its own tab would strand it behind the overlay.
 *
 * Only one is ever up: raising a sheet puts away whichever was already there.
 * Each surface owns its own open flag (nav, the page's options, a page's own
 * detail sheet), so without this a second tab-bar tap stacked a second Drawer
 * over the first — two overlays, two scroll locks, and the tab that got you
 * there reading as active underneath something else.
 */
export function MobileSheet({
  opened,
  onClose,
  children,
  /** Fills the space above the tab bar rather than hugging its content — for a
   *  surface you work IN rather than pick from. */
  fill,
  /** Keeps the content mounted while shut, so a portal target inside it exists
   *  before the sheet is first opened. */
  keepMounted,
  'data-testid': testId,
}: {
  opened: boolean
  onClose: () => void
  children: React.ReactNode
  fill?: boolean
  keepMounted?: boolean
  'data-testid'?: string
}) {
  const self = useRef<OpenSheet>({ opened, close: onClose })
  useEffect(() => {
    self.current.opened = opened
    self.current.close = onClose
  })
  useEffect(() => {
    const entry = self.current
    sheets.add(entry)
    return () => {
      sheets.delete(entry)
    }
  }, [])
  // Keyed off the shut→open transition rather than `opened` itself, so a sheet
  // re-rendering while up doesn't keep re-closing peers that reopened since.
  const wasOpened = useRef(false)
  useEffect(() => {
    if (opened && !wasOpened.current) {
      for (const sheet of sheets) {
        if (sheet !== self.current && sheet.opened) sheet.close()
      }
    }
    wasOpened.current = opened
  }, [opened])

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size={fill ? '100%' : 'auto'}
      keepMounted={keepMounted}
      withCloseButton={false}
      padding={0}
      overlayProps={{ backgroundOpacity: 0.55, blur: 2 }}
      data-testid={testId}
      styles={{
        // Mantine's drawer viewport stretches its content across the cross axis,
        // so `size="auto"` still produced a full-height sheet — six nav items
        // with 500px of nothing under them. Seat it on the foot instead and let
        // the content's own height decide.
        inner: { bottom: 'var(--mobile-tabbar-foot)', alignItems: 'flex-end' },
        overlay: { bottom: 'var(--mobile-tabbar-foot)' },
        content: {
          background: 'var(--app-panel-bg)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          // Never taller than the screen it slid over: long content scrolls
          // inside the sheet rather than pushing its own head off-screen. A
          // filling sheet still leaves a strip of page visible at the top, so
          // it stays legible as something laid OVER the page.
          height: fill ? '100%' : 'auto',
          maxHeight: `calc(100vh - var(--mobile-tabbar-foot) - ${
            fill ? 24 : 64
          }px)`,
          display: 'flex',
          flexDirection: 'column',
        },
        body: {
          flex: 1,
          minHeight: 0,
          // A hugging sheet ends exactly at its last row, which sat flush on the
          // tab bar; a filling one manages its own foot.
          padding: fill ? 0 : '0 0 8px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        },
      }}
    >
      {children}
    </Drawer>
  )
}
