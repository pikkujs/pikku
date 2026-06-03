import React from 'react'
import { Text } from '@mantine/core'
import classes from './console.module.css'

export interface SectionLabelProps {
  children: React.ReactNode
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
