import React from 'react'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { nodeColor } from '../colors'

type GraphBadgeProps = (
  | { type: 'dynamic'; badge: string; value: string | number }
  | { type: 'label'; children: I18nNode }
) & {
  color?: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
  style?: React.CSSProperties
  onClick?: React.MouseEventHandler<HTMLSpanElement>
}

const humanize = (str: string): string =>
  str.includes('/')
    ? str
    : str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

export const GraphBadge: React.FC<GraphBadgeProps> = (props) => {
  const { color, size = 'md', className, style, onClick } = props
  const accent = nodeColor(color ?? 'gray')
  const sizeClass =
    size === 'xs'
      ? 'h-3 min-w-3 px-0.5 text-[9px]'
      : size === 'sm'
        ? 'h-4 px-1.5 text-[10px]'
        : 'h-5 px-2 text-xs'

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium ${sizeClass} ${className ?? ''}`}
      style={{
        color: accent,
        background: `color-mix(in oklab, ${accent} 15%, transparent)`,
        ...style,
      }}
      onClick={onClick}
    >
      {props.type === 'label'
        ? props.children
        : asI18n(humanize(String(props.value)))}
    </span>
  )
}
