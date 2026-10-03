import { Box, Text } from '@pikku/mantine/core'
import { type I18nNode } from '@pikku/react'

// ─── Section label ───────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: I18nNode }) {
  return (
    <Box style={{ padding: '8px 14px', borderBottom: '1px solid var(--app-border)' }}>
      <Text
        size="xs"
        fw={600}
        tt="uppercase"
        style={{ letterSpacing: '0.06em', color: 'var(--app-text-faint)' }}
      >
        {children}
      </Text>
    </Box>
  )
}
