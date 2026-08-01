import React from 'react'
import { Center, Loader, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { VirtualUserNavigator } from './VirtualUserNavigator'
import { VirtualUserDocument } from './VirtualUserDocument'
import { useVirtualUsers } from '../../hooks/useVirtualUsers'

const EXAMPLE =
  "export const impatientShopper = pikkuVirtualUser({ actor: 'shopper', disposition: 'careless' })"

/**
 * The virtual users reading surface: who is declared, and what each one would
 * do if it were run. Deliberately not a run view — a run happens against a real
 * stage, over real auth, from the CLI or from Fabric, and pretending otherwise
 * here would put a button on something that spends money.
 */
export const VirtualUsersWorkspace: React.FC = () => {
  const { users, selected, setSelectedId, loading } = useVirtualUsers()

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.nav_virtual_users()}
          description={m.virtual_users_page_description()}
          docsHref="https://pikku.dev/docs/wiring/workflows"
        />
      }
      leftDrawer={
        loading ? null : (
          <VirtualUserNavigator
            users={users}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
        )
      }
      hidePanel
    >
      {loading ? (
        <Center style={{ flex: 1 }}>
          <Loader />
        </Center>
      ) : selected ? (
        <VirtualUserDocument user={selected} />
      ) : (
        <Center p="xl">
          <Stack gap="xs" align="center" style={{ maxWidth: '60ch' }}>
            <Text size="sm" fw={600}>
              {m.virtual_users_empty_title()}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {m.virtual_users_empty_description()}
            </Text>
            {/* Code, not copy — it is the same in every locale. */}
            <Text size="sm" ff="monospace" c="dimmed" ta="center">
              {asI18n(EXAMPLE)}
            </Text>
          </Stack>
        </Center>
      )}
    </ResizablePanelLayout>
  )
}
