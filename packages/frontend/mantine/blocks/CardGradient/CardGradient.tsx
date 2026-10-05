import { Palette } from 'lucide-react'
import { Paper, Text, ThemeIcon } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './CardGradient.module.css'

export type CardGradientProps = {
  title?: I18nString
  description?: I18nString
}

export function CardGradient({
  title = m.cardgradient__title(),
  description = m.cardgradient__description(),
}: CardGradientProps = {}) {
  return (
    <Paper withBorder radius="md" className={classes.card}>
      <ThemeIcon
        size="xl"
        radius="md"
        variant="gradient"
        gradient={{ deg: 0, from: 'pink', to: 'orange' }}
      >
        <Palette size={28} strokeWidth={1.5} />
      </ThemeIcon>
      <Text size="xl" fw={500} mt="md">
        {title}
      </Text>
      <Text size="sm" mt="sm" c="dimmed">
        {description}
      </Text>
    </Paper>
  )
}
