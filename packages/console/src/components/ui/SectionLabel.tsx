import React from 'react'
import { Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import classes from './console.module.css'

export interface SectionLabelProps {
  children: I18nNode
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ children }) => (
  <Text
    size="sm"
    fw={600}
    ff="monospace"
    c="var(--app-section-label)"
    tt="uppercase"
    className={classes.sectionLabel}
  >
    {children}
  </Text>
)
