import { Box, Center, Loader } from '@pikku/mantine/core'
import type { SidebarProps } from '../project/Sidebar'
import { PikkuMetaProvider, usePikkuMeta } from '../../context/PikkuMetaContext'
import { SpotlightSearch } from '../search/SpotlightSearch'
import { ConnectionScreen } from './ConnectionScreen'
import { ContentArea } from '../shell/ContentArea'
import { ConsoleScreen } from '../shell/ConsoleScreen'
import { ConsoleNavDock } from '../nav-dock/ConsoleNavDock'

export interface AppLayoutProps {
  children: React.ReactNode
  /** The nav model. Only `sections` reaches the dock — the rail's branding and
   *  footer slots have no equivalent on a row of tiles. */
  sidebar?: SidebarProps
}

const AppLayoutInner: React.FC<AppLayoutProps> = ({ children, sidebar }) => {
  const { loading, error } = usePikkuMeta()

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
      <AppLayoutInner sidebar={sidebar}>{children}</AppLayoutInner>
    </PikkuMetaProvider>
  )
}
