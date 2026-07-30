import React from 'react'
import { Badge } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'

type KnowledgeStatusBadgeProps = {
  status: string
  size?: string
}

/**
 * A slice's status. The vocabulary is closed — `proposed`, `dispatched`, `built` —
 * so those three read as translated copy; anything else is shown verbatim, which
 * is what a reader needs to see when validate has flagged the status as one no
 * gate recognises.
 */
const LABEL: Record<string, () => I18nString> = {
  proposed: m.knowledge_status_proposed,
  dispatched: m.knowledge_status_dispatched,
  built: m.knowledge_status_built,
}

const COLOR: Record<string, string> = {
  proposed: 'gray',
  dispatched: 'blue',
  built: 'teal',
}

export const KnowledgeStatusBadge: React.FC<KnowledgeStatusBadgeProps> = ({
  status,
  size = 'xs',
}) => (
  <Badge
    size={size}
    variant="light"
    radius="sm"
    tt="none"
    color={COLOR[status] ?? 'orange'}
  >
    {LABEL[status]?.() ?? asI18n(status)}
  </Badge>
)
