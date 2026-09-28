import React from 'react'
import { Box } from '@pikku/mantine/core'
import classes from './scenarios.module.css'
import type { ScenarioLensStatus } from './scenario-run-lens'

/**
 * One vocabulary for how a scenario is doing, used by the rail, the section
 * rule and the row marker so a colour means the same thing everywhere on the
 * screen: green passed, red failed, the accent is happening right now, amber
 * has never run, grey is waiting its turn.
 */
export const SCENARIO_STATUS_COLOUR: Record<ScenarioLensStatus, string> = {
  passed: 'var(--mantine-color-green-6)',
  failed: 'var(--mantine-color-red-6)',
  running: 'var(--mantine-primary-color-filled)',
  never: 'var(--mantine-color-yellow-6)',
  waiting: 'var(--mantine-color-default-border)',
}

type ScenarioStatusMarkProps = {
  status: ScenarioLensStatus
  size?: number
}

export const ScenarioStatusMark: React.FC<ScenarioStatusMarkProps> = ({
  status,
  size = 8,
}) => (
  <Box
    data-testid={`scenario-status-mark-${status}`}
    className={status === 'running' ? classes.statusPulse : undefined}
    style={{
      width: size,
      height: size,
      borderRadius: size,
      flexShrink: 0,
      background: SCENARIO_STATUS_COLOUR[status],
    }}
  />
)
