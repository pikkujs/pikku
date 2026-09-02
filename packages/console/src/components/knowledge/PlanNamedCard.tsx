import React from 'react'
import { Badge, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { PlanItemCard } from './PlanItemCard'

type PlanNamedCardProps = {
  name: string
  description: string
  app?: string
}

/** A plan item that is only a name and a sentence — a role, a scope. */
export const PlanNamedCard: React.FC<PlanNamedCardProps> = ({
  name,
  description,
  app,
}) => {
  return (
    <PlanItemCard>
      <Group gap={6} wrap="nowrap" align="center">
        <Text size="xs" fw={600} ff="monospace">
          {asI18n(name)}
        </Text>
        {app && (
          <Badge size="xs" variant="light">
            {asI18n(app)}
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
        {asI18n(description)}
      </Text>
    </PlanItemCard>
  )
}
