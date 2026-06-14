import React from 'react'
import { Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'

export interface ValTextProps {
  value: any
  fallback?: string
  isBoolean?: boolean
}

export const ValText: React.FC<ValTextProps> = ({
  value,
  fallback = '—',
  isBoolean,
}) => {
  const display = value != null && value !== '' ? String(value) : fallback
  const isDim = display === fallback

  if (isBoolean && !isDim) {
    return (
      <Text
        size="sm"
        ff="monospace"
        c={value ? '#86efac' : 'var(--app-text-muted)'}
      >
        {asI18n(String(value))}
      </Text>
    )
  }

  return (
    <Text
      size="sm"
      ff="monospace"
      c={isDim ? 'var(--app-text-muted)' : 'var(--app-text)'}
    >
      {asI18n(display)}
    </Text>
  )
}
