import React from 'react'
import { Badge, type BadgeProps } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'

type GraphBadgeProps = (
  | { type: 'dynamic'; badge: string; value: string | number }
  | { type: 'label'; children: I18nNode }
) &
  Omit<BadgeProps, 'children'> & {
    onClick?: React.MouseEventHandler<HTMLDivElement>
  }

const humanize = (str: string): string =>
  str.includes('/')
    ? str
    : str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

export const GraphBadge: React.FC<GraphBadgeProps> = (props) => {
  const { type, size: propSize, ...rest } = props as any
  const size = propSize || 'md'

  if (type === 'label') {
    const { children, color, variant, ...badgeProps } = rest
    return (
      <Badge
        size={size}
        tt="none"
        variant={(variant || 'light') as BadgeProps['variant']}
        color={color || 'gray'}
        {...badgeProps}
      >
        {children}
      </Badge>
    )
  }

  const { badge: _badge, value, color, variant, style, ...badgeProps } = rest
  return (
    <Badge
      size={size}
      tt="none"
      variant={(variant || 'light') as BadgeProps['variant']}
      color={color || 'gray'}
      {...badgeProps}
      style={{ flexShrink: 0, ...style }}
    >
      {asI18n(humanize(String(value)))}
    </Badge>
  )
}
