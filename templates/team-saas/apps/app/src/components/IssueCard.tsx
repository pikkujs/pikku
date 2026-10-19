import type { FC } from 'react'
import { Badge, Card, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@/i18n/messages'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { issueStatus, issuePriority } from '@/i18n/i18n-enum.gen'
import type { IssueStatusKey, IssuePriorityKey } from '@/i18n/i18n-enum.gen'

type Props = {
  reference: string
  title: string
  status: string
  priority: string
  statusColor: string
  priorityColor: string
}

/**
 * One issue, for a screen too narrow to be a table.
 *
 * The board's three columns do not survive 375px: compressed, both badges clip
 * to two letters and the title to a few words; scrolled, status and priority sit
 * off-screen. A card puts the reference and title on their own line and lets the
 * two badges sit together underneath, where they can both be read.
 */
export const IssueCard: FC<Props> = ({
  reference,
  title,
  status,
  priority,
  statusColor,
  priorityColor,
}) => {
  return (
  <Card withBorder radius="md" padding="sm">
    <Stack gap={6}>
      <Group gap="xs" align="baseline" wrap="nowrap">
        <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
          {asI18n(reference)}
        </Text>
        <Text fw={600} size="sm">
          {asI18n(title)}
        </Text>
      </Group>
      <Group gap={6}>
        <Badge
          size="md"
          variant="light"
          color={statusColor}
          styles={{ label: { color: STATUS_TEXT_COLOR } }}
        >
          {issueStatus[status as IssueStatusKey]()}
        </Badge>
        <Badge
          size="md"
          variant={priority === 'low' ? 'transparent' : priority === 'normal' ? 'default' : 'light'}
          color={priorityColor}
          styles={{ label: { color: STATUS_TEXT_COLOR } }}
        >
          {issuePriority[priority as IssuePriorityKey]()}
        </Badge>
      </Group>
    </Stack>
  </Card>
)
}
