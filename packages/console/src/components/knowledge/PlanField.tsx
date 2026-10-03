import React from 'react'
import { Group, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'

type PlanFieldProps = { label: I18nString; children: React.ReactNode }

/** A labelled line inside a plan item — `wire`, `permission`, a relationship. */
export const PlanField: React.FC<PlanFieldProps> = ({ label, children }) => {
  return (
    <Group gap={6} align="baseline" wrap="nowrap">
      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      {children}
    </Group>
  )
}
