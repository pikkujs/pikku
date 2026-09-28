import React from 'react'
import { ThemeIcon } from '@pikku/mantine/core'
import { STATUS_TONE_COLOR, type StatusTone } from './StatusBadge'

export const StatusTile: React.FC<{
  tone: StatusTone
  children: React.ReactNode
}> = ({ tone, children }) => (
  <ThemeIcon variant="light" color={STATUS_TONE_COLOR[tone]} size={36} radius="md">
    {children}
  </ThemeIcon>
)
