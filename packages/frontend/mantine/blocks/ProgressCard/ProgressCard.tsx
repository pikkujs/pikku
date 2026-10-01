import { Card, Progress, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'

export type ProgressCardProps = {
  label?: I18nString
  // Opaque numeric amount — asI18n(...), never translated.
  amount?: I18nString
  value?: number
}

export function ProgressCard({
  label = m.progresscard__monthly_goal(),
  amount = asI18n('$5.431 / $10.000'),
  value = 54.31,
}: ProgressCardProps = {}) {
  return (
    <Card withBorder radius="md" padding="xl" bg="var(--mantine-color-body)">
      <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
        {label}
      </Text>
      <Text fz="lg" fw={500}>
        {amount}
      </Text>
      <Progress
        value={value}
        mt="md"
        size="lg"
        radius="xl"
        aria-label={m.progresscard__progress_label()}
      />
    </Card>
  )
}
