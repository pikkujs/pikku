import React from 'react'
import { Badge } from '@mantine/core'
import classes from './console.module.css'

export interface TagBadgeProps {
  children: React.ReactNode
}

export const TagBadge: React.FunctionComponent<TagBadgeProps> = ({
  children,
}) => (
  <Badge size="sm" variant="light" ff="monospace" className={classes.tagBadge}>
    {children}
  </Badge>
)

export interface ServiceBadgeProps {
  children: React.ReactNode
}

export const ServiceBadge: React.FunctionComponent<ServiceBadgeProps> = ({
  children,
}) => (
  <Badge size="sm" variant="light" tt="none" className={classes.serviceBadge}>
    {children}
  </Badge>
)
