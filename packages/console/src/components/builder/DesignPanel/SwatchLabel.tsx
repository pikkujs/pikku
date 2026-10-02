import { Text } from '@pikku/mantine/core'
import { type I18nNode } from '@pikku/react'

export function SwatchLabel({ children }: { children: I18nNode }) {
  return (
    <Text
      size="xs"
      fw={600}
      tt="uppercase"
      style={{ letterSpacing: '0.06em', color: 'var(--app-text-faint)' }}
    >
      {children}
    </Text>
  )
}
