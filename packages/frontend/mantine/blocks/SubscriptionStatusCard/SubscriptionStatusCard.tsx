import { Badge, Button, Group, Paper, type PaperProps, Stack, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'

type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'none'

const STATUS_COLOR: Record<SubStatus, string> = {
  active: 'green',
  trialing: 'blue',
  past_due: 'orange',
  canceled: 'gray',
  incomplete: 'yellow',
  none: 'gray',
}

// Literal m.key() per status so the console text editor can find each one.
function statusLabel(status: SubStatus) {
  switch (status) {
    case 'active':
      return m.subscriptionstatuscard__status_active()
    case 'trialing':
      return m.subscriptionstatuscard__status_trialing()
    case 'past_due':
      return m.subscriptionstatuscard__status_past_due()
    case 'canceled':
      return m.subscriptionstatuscard__status_canceled()
    default:
      return m.subscriptionstatuscard__status_incomplete()
  }
}

// The current-plan summary card for a billing page. Presentational: the page passes
// the plan name, status and renewal date (from the Better Auth Stripe client) and an
// onManage handler that opens the Stripe customer portal. When there's no active
// plan, it prompts to choose one via onManage.
export function SubscriptionStatusCard({
  planName,
  status,
  renewsOn,
  onManage,
  ...props
}: PaperProps & {
  planName?: I18nString
  status: SubStatus
  /** preformatted renewal date, e.g. new Date(periodEnd).toLocaleDateString() */
  renewsOn?: string
  onManage: () => void
}) {
  const active = status !== 'none'
  return (
    <Paper withBorder p="lg" radius="md" {...props}>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={600}>{m.subscriptionstatuscard__title()}</Text>
          {active ? (
            <>
              <Group gap="xs">
                <Text size="lg" fw={700}>
                  {planName ?? m.subscriptionstatuscard__unknown_plan()}
                </Text>
                <Badge color={STATUS_COLOR[status]} variant="light">
                  {statusLabel(status)}
                </Badge>
              </Group>
              {renewsOn && (
                <Text size="sm" c="dimmed">
                  {m.subscriptionstatuscard__renews({ date: renewsOn })}
                </Text>
              )}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {m.subscriptionstatuscard__none()}
            </Text>
          )}
        </Stack>
        <Button variant={active ? 'default' : 'filled'} onClick={onManage}>
          {active ? m.subscriptionstatuscard__manage() : m.subscriptionstatuscard__choose()}
        </Button>
      </Group>
    </Paper>
  )
}
