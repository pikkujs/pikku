import React from 'react'
import { Box } from '@pikku/mantine/core'
import { Plug, Server } from 'lucide-react'
import type { SubjectKind } from './subject-types'

type SubjectAvatarProps = {
  kind: SubjectKind
  size?: number
}

/**
 * A non-human actor's mark.
 *
 * Square where a persona's is round, and it carries no generated colour: the
 * shape is the whole point. Read down a mixed list, a rounded rectangle says
 * "this one is not somebody" before any badge has been read.
 */
export const SubjectAvatar: React.FC<SubjectAvatarProps> = ({
  kind,
  size = 48,
}) => {
  const Icon = kind === 'platform' ? Server : Plug
  const ring = Math.max(2, Math.round(size * 0.06))
  const color = kind === 'platform' ? 'violet' : 'grape'

  return (
    <Box
      style={{
        padding: ring,
        borderRadius: Math.round(size * 0.3),
        flexShrink: 0,
        background: `var(--mantine-color-${color}-light)`,
      }}
    >
      <Box
        data-testid={`subject-avatar-${kind}`}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.24),
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
