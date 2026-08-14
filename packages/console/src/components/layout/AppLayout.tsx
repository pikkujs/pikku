import { useEffect, useState } from 'react'
import { Box, Button, Center, Loader } from '@pikku/mantine/core'
import { useLocation } from '../../router'
import { Sidebar, type SidebarProps } from '../project/Sidebar'
import { PikkuMetaProvider, usePikkuMeta } from '../../context/PikkuMetaContext'
import {
  PageOptionsProvider,
  usePageOptions,
} from '../../context/PageOptionsProvider'
import { SidebarModeProvider } from '../../context/SidebarModeProvider'
import { SpotlightSearch } from '../search/SpotlightSearch'
import { ConnectionScreen } from './ConnectionScreen'
import { ContentArea } from '../shell/ContentArea'
import { ConsoleScreen } from '../shell/ConsoleScreen'
import { MobileSheet } from '../shell/MobileSheet'
import { MobileTabBar } from '../shell/MobileTabBar'
import { ConsoleNavDock } from '../nav-dock/ConsoleNavDock'
import { usePhone } from '../../lib/breakpoints'

export interface AppLayoutProps {
  children: React.ReactNode
  /** The nav model. Only `sections` reaches the dock — the rail's branding and
   *  footer slots have no equivalent on a row of tiles, and reach the phone's
   *  nav sheet, which is still the rail. */
  sidebar?: SidebarProps
}

const AppLayoutInner: React.FC<AppLayoutProps> = ({ children, sidebar }) => {
  const { initialLoading, error } = usePikkuMeta()
  const { pathname } = useLocation()
  const phone = usePhone()
  const [navOpen, setNavOpen] = useState(false)
  // The page's OWN rail of choices, if it registered one (PageOptionsPortal).
  // The layout renders the sheet; the page only says what goes in it.
  const {
    hasOptions,
    label: optionsLabel,
    setHost: setOptionsHost,
    open: optionsOpen,
    setOpen: setOptionsOpen,
    action,
  } = usePageOptions()

  // A nav tap navigates, so nothing raised over the page may survive the move.
  useEffect(() => {
    setNavOpen(false)
    setOptionsOpen(false)
  }, [pathname, setOptionsOpen])

  // Only the first load blanks the screen. A metadata refresh from the dock
  // keeps the page it was on: the tile carries the busy badge, and the meta
  // swaps under the screen when it arrives.
  if (initialLoading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    )
  }

  if (error) {
    return <ConnectionScreen error={error} />
  }

  // A phone gets the tab bar instead of the dock: the dock is a pointer surface
  // — hover raises it, a long press opens its menus — and it occupies the one
  // edge a thumb can reach, which the bar needs. Navigation arrives as the rail
  // in a sheet, which is a list you can scroll and tap.
  if (phone) {
    return (
      <>
        <SpotlightSearch />
        <MobileSheet opened={navOpen} onClose={() => setNavOpen(false)}>
          <SidebarModeProvider mode="sheet">
            <Sidebar {...sidebar} />
          </SidebarModeProvider>
        </MobileSheet>
        {/* Always mounted so the portal host exists before the sheet is ever
            opened — a page that registers its rail must be able to render into
            it immediately. */}
        <MobileSheet
          opened={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          keepMounted
          data-testid="page-options-sheet"
        >
          {/* Pinned above the body rather than left inside it: the surface it
              belongs to scrolls, and an action that scrolls out of a sheet is one
              the user has to go looking for. */}
          {action && (
            <Box
              p={10}
              style={{
                flexShrink: 0,
                borderBottom: '1px solid var(--app-border)',
              }}
            >
              <Button
                fullWidth
                leftSection={action.icon}
                onClick={() => {
                  action.onSelect()
                  setOptionsOpen(false)
                }}
                data-testid="page-options-action"
              >
                {action.label}
              </Button>
            </Box>
          )}
          <Box
            ref={setOptionsHost}
            style={{ flex: 1, minWidth: 0, display: 'flex' }}
          />
        </MobileSheet>
        {/* `dvh`, not `vh`: in a mobile browser `100vh` is the tallest the
            viewport ever gets, so the foot of the screen sat under Safari's
            address bar until it collapsed. Installed standalone the two agree. */}
        <Box
          style={{
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'var(--safe-top)',
            paddingInline: 'var(--safe-left) var(--safe-right)',
            paddingBottom: 'var(--mobile-tabbar-foot)',
          }}
        >
          <ContentArea>
            <ConsoleScreen>{children}</ConsoleScreen>
          </ContentArea>
        </Box>
        <MobileTabBar
          navOpen={navOpen}
          onToggleNav={() => setNavOpen(!navOpen)}
          optionsOpen={optionsOpen}
          optionsLabel={optionsLabel}
          onToggleOptions={
            hasOptions ? () => setOptionsOpen(!optionsOpen) : undefined
          }
        />
      </>
    )
  }

  return (
    <>
      <SpotlightSearch />
      <ConsoleNavDock sections={sidebar?.sections} />
      {/* Floating, the dock reserves nothing and the content starts at the
          window edge — it is over the card gutter that is already there. Held
          open it is furniture, so it publishes the edge it took and the screen
          stops there instead of running underneath it. */}
      <Box
        h="100vh"
        style={{
          display: 'flex',
          minWidth: 0,
          paddingTop: 'var(--nav-dock-inset-top)',
          paddingBottom: 'var(--nav-dock-inset-bottom)',
          paddingInline:
            'var(--nav-dock-inset-left) var(--nav-dock-inset-right)',
        }}
      >
        <ContentArea>
          <ConsoleScreen>{children}</ConsoleScreen>
        </ContentArea>
      </Box>
    </>
  )
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, sidebar }) => {
  return (
    <PikkuMetaProvider>
      <PageOptionsProvider>
        <AppLayoutInner sidebar={sidebar}>{children}</AppLayoutInner>
      </PageOptionsProvider>
    </PikkuMetaProvider>
  )
}
