import React from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { KnowledgeFinding } from '../../lib/knowledge'

export const SEVERITY_COLOR: Record<KnowledgeFinding['severity'], string> = {
  error: 'var(--mantine-color-red-5)',
  warn: 'var(--mantine-color-yellow-6)',
  info: 'var(--mantine-color-blue-5)',
}

/**
 * What the shape and colour mean, in words. Severity is otherwise carried by a
 * red triangle and nothing else, which is no signal at all to a screen reader and
 * a weak one to a reader who cannot tell the red from the yellow.
 */
const SEVERITY_LABEL: Record<KnowledgeFinding['severity'], () => string> = {
  error: m.knowledge_severity_error,
  warn: m.knowledge_severity_warn,
  info: m.knowledge_severity_info,
}

type KnowledgeSeverityIconProps = {
  severity: KnowledgeFinding['severity']
  size?: number
}

export const KnowledgeSeverityIcon: React.FC<KnowledgeSeverityIconProps> = ({
  severity,
  size = 14,
}) => {
  const Icon = severity === 'info' ? Info : AlertTriangle
  return (
    <Icon
      size={size}
      color={SEVERITY_COLOR[severity]}
      role="img"
      aria-label={SEVERITY_LABEL[severity]()}
    />
  )
}
