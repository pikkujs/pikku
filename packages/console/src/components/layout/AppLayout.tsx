import { useEffect, useState } from 'react'
import { Box, Center, Loader } from '@pikku/mantine/core'
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
  const { loading, error } = usePikkuMeta()
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
  } = usePageOptions()

  // A nav tap navigates, so nothing raised over the page may survive the move.
  useEffect(() => {
    setNavOpen(false)
    setOptionsOpen(false)
  }, [pathname, setOptionsOpen])

  if (loading) {
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
      {/* The dock reserves no layout — it floats over the card gutter that is
          already there — so the content area starts at the window edge. */}
      <ConsoleNavDock sections={sidebar?.sections} />
      <Box h="100vh" style={{ display: 'flex', minWidth: 0 }}>
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
