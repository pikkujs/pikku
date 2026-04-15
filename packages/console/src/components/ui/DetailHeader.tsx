import React from 'react'
import { Box, Text, Badge } from '@mantine/core'
import classes from './console.module.css'

export interface DetailHeaderProps {
  title: string
  subtitle?: string | null
  badge?: { label: string; color: string }
  children?: React.ReactNode
}

export const DetailHeader: React.FunctionComponent<DetailHeaderProps> = ({
  title,
  subtitle,
  badge,
  children,
}) => (
  <Box className={classes.detailHeader}>
    <Box className={classes.flexGrow}>
      <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)" mb={subtitle ? 4 : 0}>
        {title}
      </Text>
      {subtitle && (
        <Text size="xs" ff="monospace" c="var(--app-text-muted)">
          {subtitle}
        </Text>
      )}
    </Box>
    {badge && (
      <Badge size="sm" variant="light" color={badge.color}>
        {badge.label}
      </Badge>
    )}
    {children}
  </Box>
)
