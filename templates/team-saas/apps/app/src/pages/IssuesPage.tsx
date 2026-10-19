import type { FC } from 'react'
import {
  Badge,
  Button,
  Box,
  Card,
  Group,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@pikku/mantine/core'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { IssueCard } from '@/components/IssueCard'
import { NewIssueForm } from '@/components/NewIssueForm'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { issueStatus, issuePriority } from '@/i18n/i18n-enum.gen'
import type { IssueStatusKey, IssuePriorityKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

/**
 * Priority carries the colour, not status.
 *
 * Every row on this board is open — that is what a backlog is — so status is
 * the constant and priority is the variable. Colouring the constant would make
 * the whole table one shade and tell the reader nothing.
 */
const PRIORITY_COLOR: Record<IssuePriorityKey, string> = {
  urgent: 'red',
  high: 'orange',
  normal: 'gray',
  low: 'gray',
}

const STATUS_COLOR: Record<IssueStatusKey, string> = {
  open: 'blue',
  in_progress: 'violet',
  done: 'teal',
  // `dark` rather than `gray`: on a near-black background a grey light
  // variant has no visible ground, so the closed row lost its pill and
  // read as bare text beside rows that kept theirs.
  closed: 'dark',
}

type Props = {
  orgId: string
  /**
   * The workspace's name, when the caller knows it.
   *
   * A person can belong to several organisations, so "this workspace" is not an
   * answer — it is the question. Optional because the id is what the page needs
   * to *work*; the name is what the reader needs to trust what they are seeing.
   */
  orgName?: string
}

export const IssuesPage: FC<Props> = ({ orgId, orgName }) => {
  useLocale()

  // Every read carries the organisation. There is no "current tenant" hidden in
  // a service or a header — the id is part of the call, and the server checks
  // membership rather than trusting it.
  const issues = usePikkuQuery('listIssues', { orgId, limit: 50 })
  const closeIssue = usePikkuMutation('closeIssue')

  const open = (issues.data?.issues ?? []).filter(
    (i) => i.status === 'open' || i.status === 'in_progress'
  ).length

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
            {m.issues__title()}
          </Title>
          <Text c="dimmed" size="sm">
            {orgName ? m.issues__subtitle_in({ org: orgName }) : m.issues__subtitle()}
          </Text>
        </Box>
        {!issues.isLoading && (
          <Badge
            size="lg"
            variant="light"
            color="blue"
            styles={{ label: { color: STATUS_TEXT_COLOR } }}
          >
            {m.issues__open({ count: open })}
          </Badge>
        )}
      </Group>

      <NewIssueForm orgId={orgId} onRaised={() => void issues.refetch()} />

      {issues.isError ? (
        <QueryErrorCard error={issues.error} onRetry={() => void issues.refetch()} />
      ) : issues.isLoading ? (
        <Stack gap="xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h={44} radius="sm" />
          ))}
        </Stack>
      ) : issues.data?.issues.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.issues__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.issues__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
        {/* Cards below `md`, a table from `md` up. The switch is at 992px and
            not 768 because at 768 the table still ellipsised "In progress" by
            3px — and raising the badge type from 10px to 11px widens every
            label, so the table only appears where the wider labels fit. */}
        <Stack gap="xs" hiddenFrom="md">
          {issues.data?.issues.map((issue) => (
            <IssueCard
              key={issue.issueId}
              reference={`${issue.projectKey}-${issue.number}`}
              title={issue.title}
              status={issue.status}
              priority={issue.priority}
              statusColor={STATUS_COLOR[issue.status as IssueStatusKey]!}
              priorityColor={PRIORITY_COLOR[issue.priority as IssuePriorityKey]!}
            />
          ))}
        </Stack>
        <Card withBorder radius="md" p={0} visibleFrom="md">
          {/* The table still needs a scroll escape above the switch. Between 992
              and 1280 the columns are narrower than their contents:
              This page happens to fit today because its labels are short; the escape
              hatch is here so a longer translation cannot silently clip it.
              Compressing is not an option — a clipped status is the one cell
              nobody can afford to misread — so the table keeps its width and the
              container scrolls. */}
          <Table.ScrollContainer minWidth={720} type="native">
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{m.issues__col_issue()}</Table.Th>
                <Table.Th>{m.issues__col_status()}</Table.Th>
                <Table.Th>{m.issues__col_priority()}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {issues.data?.issues.map((issue) => (
                <Table.Tr key={issue.issueId}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Text size="sm" c="dimmed" ff="monospace">
                        {asI18n(`${issue.projectKey}-${issue.number}`)}
                      </Text>
                      <Text fw={600} size="sm" lineClamp={1}>
                        {asI18n(issue.title)}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="md"
                      variant="light"
                      color={STATUS_COLOR[issue.status as IssueStatusKey]}
                      styles={{
                        label: {
                          color: STATUS_TEXT_COLOR,
                        },
                      }}
                    >
                      {issueStatus[issue.status as IssueStatusKey]()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="md"
                      variant={issue.priority === 'low' ? 'transparent' : issue.priority === 'normal' ? 'default' : 'light'}
                      color={PRIORITY_COLOR[issue.priority as IssuePriorityKey]}
                      styles={{
                        label: {
                          color: STATUS_TEXT_COLOR,
                        },
                      }}
                    >
                      {issuePriority[issue.priority as IssuePriorityKey]()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {/* Only open work can be closed. Rendering a disabled button
                        on a done row would be an action that never applies. */}
                    {(issue.status === 'open' || issue.status === 'in_progress') && (
                      <Button
                        size="compact-sm"
                        variant="default"
                        loading={closeIssue.isPending && closeIssue.variables?.issueId === issue.issueId}
                        onClick={() =>
                          closeIssue
                            .mutateAsync({ issueId: issue.issueId, resolution: 'done' })
                            .then(() => issues.refetch())
                        }
                      >
                        {m.issues__close()}
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Card>
        </>
      )}
    </Stack>
  )
}
