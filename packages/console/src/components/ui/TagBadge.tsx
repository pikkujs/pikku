import React from 'react'
import { Badge } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import classes from './console.module.css'

export interface TagBadgeProps {
  children: I18nNode
}

export const TagBadge: React.FC<TagBadgeProps> = ({ children }) => (
  <Badge size="sm" variant="light" ff="monospace" className={classes.tagBadge}>
    {children}
  </Badge>
)

export interface ServiceBadgeProps {
  children: I18nNode
}

export const ServiceBadge: React.FC<ServiceBadgeProps> = ({ children }) => (
  <Badge size="sm" variant="light" tt="none" className={classes.serviceBadge}>
    {children}
  </Badge>
)
