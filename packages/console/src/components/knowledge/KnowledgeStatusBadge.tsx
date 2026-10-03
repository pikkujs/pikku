import React from 'react'
import { asI18n, type I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'

type KnowledgeStatusBadgeProps = {
  status: string
  size?: 'sm' | 'lg'
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

const TONE: Record<string, StatusTone> = {
  proposed: 'neutral',
  dispatched: 'info',
  built: 'good',
}

export const knowledgeStatusTone = (status: string | undefined): StatusTone =>
  status ? (TONE[status] ?? 'warn') : 'neutral'

export const KnowledgeStatusBadge: React.FC<KnowledgeStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => (
  <StatusBadge tone={knowledgeStatusTone(status)} size={size}>
    {LABEL[status]?.() ?? asI18n(status)}
  </StatusBadge>
)
