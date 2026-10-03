import { ActionIcon, Box, Group, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'

// ─── Shared row shell ────────────────────────────────────────────────────────

export function PropRowShell({
  propName,
  label,
  description,
  saving,
  unset,
  onClear,
  children,
}: {
  propName: string
  label: I18nNode
  description?: I18nNode
  saving: boolean
  unset?: boolean
  onClear?: () => void
  children: React.ReactNode
}) {
  return (
    <Box
      data-testid={`design-prop-row-${propName}`}
      style={{
        padding: '10px 14px 11px',
        borderBottom: '1px solid var(--app-border)',
        opacity: saving ? 0.6 : unset ? 0.5 : 1,
      }}
    >
      <Group gap={6} align="baseline" mb={6}>
        <Text fw={600} size="sm" style={{ flex: 1, color: 'var(--app-text)' }}>
          {label}
        </Text>
        <Text size="xs" ff="monospace" c="dimmed" style={{ opacity: 0.7 }}>
          {asI18n(propName)}
        </Text>
        {!unset && onClear && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="xs"
            onClick={onClear}
            title={m.design_panel_remove_prop_title()}
          >
            ✕
          </ActionIcon>
        )}
      </Group>
      {description && (
        <Text size="xs" c="dimmed" mb={6} style={{ lineHeight: 1.4 }}>
          {description}
        </Text>
      )}
      {children}
    </Box>
  )
}
