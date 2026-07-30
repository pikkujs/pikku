import React from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import type { KnowledgeFinding } from '../../lib/knowledge'

export const SEVERITY_COLOR: Record<KnowledgeFinding['severity'], string> = {
  error: 'var(--mantine-color-red-5)',
  warn: 'var(--mantine-color-yellow-6)',
  info: 'var(--mantine-color-blue-5)',
}

type KnowledgeSeverityIconProps = {
  severity: KnowledgeFinding['severity']
  size?: number
}

export const KnowledgeSeverityIcon: React.FC<KnowledgeSeverityIconProps> = ({
  severity,
  size = 14,
}) =>
  severity === 'info' ? (
    <Info size={size} color={SEVERITY_COLOR[severity]} />
  ) : (
    <AlertTriangle size={size} color={SEVERITY_COLOR[severity]} />
  )
