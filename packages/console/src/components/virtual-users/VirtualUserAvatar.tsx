import React from 'react'
import { Avatar, Badge, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { VirtualUserDisposition } from '@pikku/core/virtual-user'
import { DISPOSITION_COLOR, DISPOSITION_LABEL } from './disposition-labels'

export const VirtualUserAvatar: React.FC<{
  name: string
  disposition: VirtualUserDisposition
  size?: number
}> = ({ name, disposition, size = 36 }) => (
  <Avatar size={size} color={DISPOSITION_COLOR[disposition]}>
    <Text span inherit c={DISPOSITION_COLOR[disposition]}>
      {asI18n(name.charAt(0).toUpperCase())}
    </Text>
  </Avatar>
)

export const DispositionBadge: React.FC<{
  disposition: VirtualUserDisposition
}> = ({ disposition }) => (
  <Badge
    size="lg"
    variant="light"
    color={DISPOSITION_COLOR[disposition]}
    c={DISPOSITION_COLOR[disposition]}
  >
    {DISPOSITION_LABEL[disposition]()}
  </Badge>
)
