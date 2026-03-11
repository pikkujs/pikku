import { Box, Center, Loader } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import {
  Sidebar,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from '@/components/project/Sidebar'
import type { SidebarProps } from '@/components/project/Sidebar'
import { PikkuMetaProvider, usePikkuMeta } from '@/context/PikkuMetaContext'
import { SpotlightSearch } from '@/components/search/SpotlightSearch'
import { ConnectionScreen } from '@/components/layout/ConnectionScreen'

export interface AppLayoutProps {
  children: React.ReactNode
  sidebar?: SidebarProps
}

const AppLayoutInner: React.FunctionComponent<AppLayoutProps> = ({
  children,
  sidebar,
}) => {
  const { loading, error } = usePikkuMeta()
  const [collapsed] = useLocalStorage({
    key: 'sidebar-collapsed',
    defaultValue: false,
  })

  const sidebarWidth = collapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_EXPANDED_WIDTH

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
      <Sidebar {...sidebar} />
      <Box
        ml={sidebarWidth}
        h="100vh"
        style={{ transition: 'margin-left 200ms ease' }}
      >
        {children}
      </Box>
    </>
  )
}

export const AppLayout: React.FunctionComponent<AppLayoutProps> = ({
  children,
  sidebar,
}) => {
  return (
    <PikkuMetaProvider>
      <AppLayoutInner sidebar={sidebar}>{children}</AppLayoutInner>
    </PikkuMetaProvider>
  )
}
