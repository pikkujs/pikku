import React from 'react'
import { Text } from '@mantine/core'

export interface ValTextProps {
  value: any
  fallback?: string
  isBoolean?: boolean
}

export const ValText: React.FunctionComponent<ValTextProps> = ({
  value,
  fallback = '—',
  isBoolean,
}) => {
  const display = value != null && value !== '' ? String(value) : fallback
  const isDim = display === fallback

  if (isBoolean && !isDim) {
    return (
      <Text size="xs" ff="monospace" c={value ? '#86efac' : 'var(--app-text-muted)'}>
        {String(value)}
      </Text>
    )
  }

  return (
    <Text size="xs" ff="monospace" c={isDim ? 'var(--app-text-muted)' : 'var(--app-text)'}>
      {display}
    </Text>
  )
}
