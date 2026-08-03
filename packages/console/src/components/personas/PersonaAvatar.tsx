import React, { useState } from 'react'
import { Box } from '@pikku/mantine/core'
import { personaVisual } from './personaVisual'

type PersonaAvatarProps = {
  personaKey: string
  jobTitle?: string
  name?: string
  /** A declared picture. Anything else falls back to the generated visual. */
  avatarUrl?: string
  size?: number
}

/**
 * A persona's face.
 *
 * The generated colour-and-icon visual is the default rather than a fallback of
 * last resort: it is derived from the persona's id, so it is stable across runs
 * and machines, needs no network, and reads as a person rather than as a
 * missing image. A declared `avatarUrl` replaces it — and a broken one falls
 * back to it, because a torn-image icon on a profile is worse than one that
 * never promised a photograph.
 */
export const PersonaAvatar: React.FC<PersonaAvatarProps> = ({
  personaKey,
  jobTitle,
  name,
  avatarUrl,
  size = 48,
}) => {
  const [failed, setFailed] = useState(false)
  const { color, Icon } = personaVisual(personaKey, jobTitle, name)
  const ring = Math.max(2, Math.round(size * 0.06))
  const showImage = !!avatarUrl && !failed

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
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          background: `var(--mantine-color-${color}-filled)`,
          color: 'var(--mantine-color-white)',
        }}
      >
        {showImage ? (
          <img
            data-testid={`persona-avatar-${personaKey}`}
            src={avatarUrl}
            alt=""
            width={size}
            height={size}
            onError={() => setFailed(true)}
            style={{ width: size, height: size, objectFit: 'cover' }}
          />
        ) : (
          <Icon size={Math.round(size * 0.46)} strokeWidth={1.9} />
        )}
      </Box>
    </Box>
  )
}
