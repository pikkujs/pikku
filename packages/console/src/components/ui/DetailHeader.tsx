import React from 'react'
import { Box, Text, Badge } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import classes from './console.module.css'

export interface DetailHeaderProps {
  title: I18nNode
  subtitle?: I18nNode | null
  badge?: { label: I18nNode; color: string }
  children?: React.ReactNode
}

export const DetailHeader: React.FC<DetailHeaderProps> = ({
  title,
  subtitle,
  badge,
  children,
}) => (
  <Box className={classes.detailHeader}>
    <Box className={classes.flexGrow}>
      <Text
        size="sm"
        fw={600}
        ff="monospace"
        c="var(--app-meta-value)"
        mb={subtitle ? 4 : 0}
      >
        {title}
      </Text>
      {subtitle && (
        <Text size="sm" ff="monospace" c="var(--app-text-muted)">
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
