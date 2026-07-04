import React from 'react'
import { Box, Group } from '@pikku/mantine/core'
import { PersonaAvatar } from '../personas/PersonaAvatar'
import type { PersonaRef } from '../personas/persona-types'

type FlowCastProps = {
  cast: PersonaRef[]
  size?: number
}

export const FlowCast: React.FC<FlowCastProps> = ({ cast, size = 26 }) => {
  return (
    <Group gap={0} wrap="nowrap">
      {cast.map((ref, i) => (
        <Box
          key={ref.key}
          style={{
            marginLeft: i === 0 ? 0 : -size * 0.32,
            borderRadius: '50%',
            border: '2px solid var(--app-surface, var(--mantine-color-body))',
          }}
        >
          <PersonaAvatar
            personaKey={ref.key}
            jobTitle={ref.jobTitle}
            name={ref.name}
            size={size}
          />
        </Box>
      ))}
    </Group>
  )
}
