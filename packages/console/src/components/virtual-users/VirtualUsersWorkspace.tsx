import React, { useEffect, useMemo, useState } from 'react'
import {
  Avatar,
  Card,
  Code,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { VirtualUserList } from './VirtualUserList'
import { VirtualUserDocument } from './VirtualUserDocument'
import { VirtualUserVisit } from './VirtualUserVisit'
import { VirtualUserAvatar } from './VirtualUserAvatar'
import { useVirtualUsers } from '../../hooks/useVirtualUsers'
import { useRecentVirtualUserRuns } from '../../hooks/useVirtualUserRuns'
import { usePageOptionsDismiss } from '../../context/PageOptionsProvider'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { PageIntro } from '../ui/PageIntro'
import { CardsPage } from '../ui/CardsPage'
import { useDeveloperDetails } from '../../hooks/useDeveloperDetails'
import { lastTries, type VirtualUserRunRow } from './run-summary'

const EXAMPLE =
  "definePersonas({ shopper: { name: 'Shopper', disposition: 'careless', goals: [...] } })"

const Empty: React.FC = () => {
  const { shown: developerDetails } = useDeveloperDetails()
  return (
    <CardsPage>
      <Card px={48} py={40}>
        <Stack gap="lg" align="center" data-testid="virtual-users-empty">
          <Avatar.Group>
            <VirtualUserAvatar name="A" disposition="realistic" size={44} />
            <VirtualUserAvatar name="B" disposition="careless" size={44} />
            <VirtualUserAvatar name="C" disposition="newcomer" size={44} />
          </Avatar.Group>
          <Stack gap={6} align="center">
            <Title order={1} ta="center" maw={640}>
              {m.virtual_users_empty_heading()}
            </Title>
            <Text c="dimmed" ta="center" maw={640}>
              {m.virtual_users_empty_body()}
            </Text>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Paper variant="inset" px="md" py="sm">
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  {m.virtual_users_benefit_people_title()}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.virtual_users_benefit_people()}
                </Text>
              </Stack>
            </Paper>
            <Paper variant="inset" px="md" py="sm">
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  {m.virtual_users_benefit_safe_title()}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.virtual_users_benefit_safe()}
                </Text>
              </Stack>
            </Paper>
            <Paper variant="inset" px="md" py="sm">
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  {m.virtual_users_benefit_report_title()}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.virtual_users_benefit_report()}
                </Text>
              </Stack>
            </Paper>
          </SimpleGrid>
          <Text size="sm" ta="center" maw={640}>
            {m.virtual_users_empty_start()}
          </Text>
          {developerDetails && <Code block>{asI18n(EXAMPLE)}</Code>}
        </Stack>
      </Card>
    </CardsPage>
  )
}

export const VirtualUsersWorkspace: React.FC = () => {
  const { users, selected, setSelectedId, loading } = useVirtualUsers()
  const { data, error } = useRecentVirtualUserRuns()
  const dismiss = usePageOptionsDismiss()
  const [visit, setVisit] = useState<VirtualUserRunRow>()

  const tries = useMemo(
    () => lastTries((data ?? []) as VirtualUserRunRow[]),
    [data]
  )

  useEffect(() => setVisit(undefined), [selected?.id])

  const select = (id: string) => {
    setSelectedId(id)
    dismiss()
  }

  const hasUsers = !loading && users.length > 0

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.nav_virtual_users()}
          description={m.virtual_users_page_description()}
          developerDetails
        />
      }
      leftDrawer={
        hasUsers ? (
          <VirtualUserList
            users={users}
            tries={tries}
            selectedId={selected?.id}
            onSelect={select}
          />
        ) : undefined
      }
      leftDrawerLabel={m.pane_virtual_users()}
      leftDrawerWidth={300}
      hidePanel
      surface="cards"
    >
      {loading ? (
        <ConsoleLoading />
      ) : users.length === 0 ? (
        <Empty />
      ) : (
        <CardsPage>
          <PageIntro
            storageKey="virtual-users"
            eyebrow={m.virtual_users_intro_eyebrow()}
            title={m.virtual_users_intro_title()}
            body={m.virtual_users_intro_body()}
            steps={[
              {
                title: m.virtual_users_intro_meet_title(),
                body: m.virtual_users_intro_meet(),
              },
              {
                title: m.virtual_users_intro_send_title(),
                body: m.virtual_users_intro_send(),
              },
              {
                title: m.virtual_users_intro_read_title(),
                body: m.virtual_users_intro_read(),
              },
            ]}
            dismissLabel={m.virtual_users_intro_dismiss()}
          />
          {error && (
            <Text size="xs" c="red">
              {asI18n(error instanceof Error ? error.message : String(error))}
            </Text>
          )}
          {selected &&
            (visit ? (
              <VirtualUserVisit
                user={selected}
                run={visit}
                onBack={() => setVisit(undefined)}
              />
            ) : (
              <VirtualUserDocument
                user={selected}
                tried={tries.get(selected.id)}
                onOpenVisit={setVisit}
              />
            ))}
        </CardsPage>
      )}
    </ResizablePanelLayout>
  )
}
