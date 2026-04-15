import React from 'react'
import { Text } from '@mantine/core'
import classes from './console.module.css'

export interface SectionLabelProps {
  children: React.ReactNode
}

export const SectionLabel: React.FunctionComponent<SectionLabelProps> = ({
  children,
}) => (
  <Text
    size="xs"
    fw={600}
    ff="monospace"
    c="var(--app-section-label)"
    tt="uppercase"
    className={classes.sectionLabel}
  >
    {children}
  </Text>
)
