import React, { useState } from 'react'
import { Box, Stack, Text, Button, Group } from '@mantine/core'
import { Check, Copy, ArrowRight } from 'lucide-react'

interface EmptyStateAction {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  href?: string
  loading?: boolean
}

export interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  /** Hero illustration rendered above the title — when provided, the icon token is hidden */
  hero?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  code?: string
  action?: EmptyStateAction
  secondaryAction?: {
    label: string
    href?: string
    onClick?: () => void
  }
  compact?: boolean
}

function CommandChip({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <Box
      component="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        navigator.clipboard?.writeText(cmd)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px 8px 13px',
        borderRadius: 8,
        border: `0.5px solid ${hovered ? 'var(--app-border-hover, var(--app-border))' : 'var(--app-border)'}`,
        background: 'var(--app-panel-bg, var(--mantine-color-body))',
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12.5,
        cursor: 'pointer',
        transition: 'border-color 130ms',
        lineHeight: 1,
      }}
    >
      <Text span c="var(--app-text-faint, var(--mantine-color-dimmed))" ff="inherit" fz="inherit">$</Text>
      <Text span c="var(--app-text, var(--mantine-color-text))" ff="inherit" fz="inherit">{cmd}</Text>
      <Box
        display="flex"
        style={{
          alignItems: 'center',
          color: copied
            ? 'var(--app-green, var(--mantine-color-green-6))'
            : 'var(--app-text-faint, var(--mantine-color-dimmed))',
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Box>
    </Box>
  )
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
      {hero ?? (Icon && (
        <Box
          style={{
            width: tokenSize,
            height: tokenSize,
            borderRadius: tokenSize * 0.28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--app-panel-bg, var(--mantine-color-body))',
            border: '0.5px solid var(--app-border, var(--mantine-color-default-border))',
            boxShadow: 'var(--app-shadow-sm, 0 1px 3px rgba(0,0,0,.06))',
            flexShrink: 0,
          }}
        >
          <Icon size={tokenSize * 0.46} strokeWidth={1.5} />
        </Box>
      ))}

      <Text
        mt={hasTop ? (compact ? 14 : 20) : 0}
        fz={compact ? 16 : 19}
        fw={650}
        c="var(--app-text, var(--mantine-color-text))"
        style={{ letterSpacing: '-0.01em' }}
      >
        {title}
      </Text>

      {subtitle && (
        <Text
          mt={8}
          fz={14}
          c="var(--app-text-dim, var(--mantine-color-dimmed))"
          maw={440}
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
