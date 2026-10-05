import { Card, Progress, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './ProgressCardColored.module.css'

export type ProgressCardColoredProps = {
  label?: I18nString
  // Opaque numeric amount — asI18n(...), never translated.
  amount?: I18nString
  value?: number
}

export function ProgressCardColored({
  label = m.progresscardcolored__monthly_goal(),
  amount = asI18n('$5.431 / $10.000'),
  value = 54.31,
}: ProgressCardColoredProps = {}) {
  return (
    <Card withBorder radius="md" p="xl" className={classes.card}>
      <Text fz="xs" tt="uppercase" fw={700} className={classes.title}>
        {label}
      </Text>
      <Text fz="lg" fw={500} className={classes.stats}>
        {amount}
      </Text>
      <Progress
        value={value}
        mt="md"
        size="lg"
        radius="xl"
        classNames={{
          root: classes.progressTrack,
          section: classes.progressSection,
        }}
        aria-label={m.progresscardcolored__progress_label()}
      />
    </Card>
  )
}
