import React from 'react'
import { Box, Stack, Text, Button, Group } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { ArrowRight } from 'lucide-react'
import { CommandChip } from './CommandChip'

interface EmptyStateAction {
  label: I18nNode
  icon?: React.ReactNode
  onClick?: () => void
  href?: string
  loading?: boolean
}

export interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  /** Hero illustration rendered above the title — when provided, the icon token is hidden */
  hero?: React.ReactNode
  title: I18nNode
  subtitle?: I18nNode
  code?: string
  action?: EmptyStateAction
  secondaryAction?: {
    label: I18nNode
    href?: string
    onClick?: () => void
  }
  compact?: boolean
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  hero,
  title,
  subtitle,
  code,
  action,
  secondaryAction,
  compact = false,
}) => {
  const tokenSize = compact ? 48 : 56
  const hasTop = !!hero || !!Icon

  return (
    <Stack
      align="center"
      justify="center"
      gap={0}
      style={{
        flex: 1,
        textAlign: 'center',
        padding: compact ? '24px 16px' : '44px 16px',
      }}
    >
      {hero ??
        (Icon && (
          <Box
            style={{
              width: tokenSize,
              height: tokenSize,
              borderRadius: tokenSize * 0.28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--app-panel-bg, var(--mantine-color-body))',
              border:
                '0.5px solid var(--app-border, var(--mantine-color-default-border))',
              boxShadow: 'var(--app-shadow-sm, 0 1px 3px rgba(0,0,0,.06))',
              flexShrink: 0,
            }}
          >
            <Icon size={tokenSize * 0.46} strokeWidth={1.5} />
          </Box>
        ))}

      <Text
        mt={hasTop ? (compact ? 14 : 24) : 0}
        fz={compact ? 17 : 22}
        fw={650}
        c="var(--app-text, var(--mantine-color-text))"
        style={{ letterSpacing: '-0.01em' }}
      >
        {title}
      </Text>

      {subtitle && (
        <Text
          mt={10}
          fz={15}
          c="var(--app-text-dim, var(--mantine-color-dimmed))"
          maw={460}
          lh={1.55}
          ta="center"
        >
          {subtitle}
        </Text>
      )}

      {code && (
        <Box mt={20}>
          <CommandChip cmd={code} />
        </Box>
      )}

      {(action || secondaryAction) && (
        <Group mt={code ? 20 : 24} gap={12} justify="center">
          {action && (
            <Button
              component={action.href ? 'a' : 'button'}
              href={action.href}
              onClick={action.onClick}
              loading={action.loading}
              leftSection={action.icon}
              variant="filled"
              radius={8}
              size="sm"
              styles={{
                root: { fontSize: 13.5, fontWeight: 600 },
              }}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Box
              component={secondaryAction.href ? 'a' : 'button'}
              href={secondaryAction.href}
              onClick={secondaryAction.onClick}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--app-text-dim, var(--mantine-color-dimmed))',
                padding: '8px 6px',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                textDecoration: 'none',
                lineHeight: 1,
              }}
            >
              {secondaryAction.label}
              <ArrowRight size={14} />
            </Box>
          )}
        </Group>
      )}
    </Stack>
  )
}
