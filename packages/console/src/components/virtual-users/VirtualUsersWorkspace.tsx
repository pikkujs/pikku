import React from 'react'
import { Center, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { VirtualUserNavigator } from './VirtualUserNavigator'
import { VirtualUserDocument } from './VirtualUserDocument'
import { useVirtualUsers } from '../../hooks/useVirtualUsers'
import { usePageOptionsDismiss } from '../../context/PageOptionsProvider'
import { ConsoleLoading } from '../ui/ConsoleLoading'

const EXAMPLE =
  "definePersonas({ shopper: { name: 'Shopper', disposition: 'careless', goals: [...] } })"

/**
 * The virtual users screen: who is declared, what each one would do if it were
 * run, what happened when they were, and whether any of them keeps going on its
 * own.
 *
 * The reading half is built from declarations alone and needs nothing wired.
 * The rest needs a store, and says so rather than failing: an application with
 * no `virtualUserRunStore` has no runs, and one with no
 * `virtualUserScheduleStore` has no cadences, which are true answers.
 *
 * Both of the controls here spend money, which is why neither is a plain
 * button. Running acts once, with whoever clicked it watching. A cadence keeps
 * acting with nobody there, so it is off until somebody turns it on and every
 * field is shown against what the persona declares.
 */
export const VirtualUsersWorkspace: React.FC = () => {
  const { users, selected, setSelectedId, loading } = useVirtualUsers()
  const dismiss = usePageOptionsDismiss()

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.nav_virtual_users()}
          description={m.virtual_users_page_description()}
          docsHref="https://pikku.dev/docs/wiring/workflows"
        />
      }
      leftDrawerLabel={m.pane_virtual_users()}
      leftDrawer={
        loading ? null : (
          <VirtualUserNavigator
            users={users}
            selectedId={selected?.id}
            onSelect={(id) => {
              setSelectedId(id)
              dismiss()
            }}
          />
        )
      }
      hidePanel
    >
      {loading ? (
        <ConsoleLoading />
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
