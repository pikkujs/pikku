import React from 'react'
import { Box } from '@pikku/mantine/core'
import type { SecuritySeverity } from '../../hooks/useSecurityAudit'
import { SEV_COLOR } from './security-view-utils'

export const SeverityDot: React.FC<{ sev: SecuritySeverity }> = ({ sev }) => (
  <Box
    style={{
      width: 8,
      height: 8,
      borderRadius: 2,
      flexShrink: 0,
      background: `var(--mantine-color-${SEV_COLOR[sev]}-6)`,
    }}
  />
)
