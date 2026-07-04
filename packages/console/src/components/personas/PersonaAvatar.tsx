import React from 'react'
import { Box } from '@pikku/mantine/core'
import { personaVisual } from './personaVisual'

type PersonaAvatarProps = {
  personaKey: string
  jobTitle?: string
  name?: string
  size?: number
}

export const PersonaAvatar: React.FC<PersonaAvatarProps> = ({
  personaKey,
  jobTitle,
  name,
  size = 48,
}) => {
  const { color, Icon } = personaVisual(personaKey, jobTitle, name)
  const ring = Math.max(2, Math.round(size * 0.06))
  return (
    <Box
      style={{
        padding: ring,
        borderRadius: '50%',
        flexShrink: 0,
        background: `var(--mantine-color-${color}-light)`,
      }}
    >
      <Box
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: `var(--mantine-color-${color}-filled)`,
          color: 'var(--mantine-color-white)',
        }}
      >
        <Icon size={Math.round(size * 0.46)} strokeWidth={1.9} />
      </Box>
    </Box>
  )
}
