import React from 'react'
import { Badge } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { Circle } from 'lucide-react'

export type StatusTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

export const STATUS_TONE_COLOR: Record<StatusTone, string> = {
  good: 'green',
  warn: 'orange',
  bad: 'red',
  info: 'blue',
  neutral: 'gray',
}

/** A status in words with a coloured dot, the one way a screen says whether something is fine. */
export const StatusBadge: React.FC<{
  tone: StatusTone
  children: I18nNode
  dot?: boolean
  size?: 'sm' | 'lg'
}> = ({ tone, children, dot = true, size = 'lg' }) => (
  <Badge
    size={size}
    color={STATUS_TONE_COLOR[tone]}
    leftSection={dot ? <Circle size={size === 'sm' ? 6 : 8} fill="currentColor" /> : undefined}
  >
    {children}
  </Badge>
)
