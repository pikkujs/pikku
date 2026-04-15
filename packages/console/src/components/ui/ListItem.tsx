import React from 'react'
import { UnstyledButton } from '@mantine/core'
import classes from './console.module.css'

export interface ListItemProps {
  active: boolean
  onClick: () => void
  gridTemplateColumns?: string
  children: React.ReactNode
  padding?: string
}

export const ListItem: React.FunctionComponent<ListItemProps> = ({
  active,
  onClick,
  gridTemplateColumns,
  children,
  padding,
}) => (
  <UnstyledButton
    onClick={onClick}
    className={classes.listItemPadded}
    data-active={active}
    style={gridTemplateColumns ? { display: 'grid', gridTemplateColumns, ...(padding ? { padding } : {}) } : (padding ? { padding } : undefined)}
  >
    {children}
  </UnstyledButton>
)
