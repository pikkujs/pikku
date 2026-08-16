import React from 'react'
import { Badge } from '@pikku/mantine/core'
import { Check, Loader, X } from 'lucide-react'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioRunStatus } from '@pikku/core/ecosystem/scenario'

/**
 * The status vocabulary, mapped to message *functions* rather than keys: a
 * runtime-assembled key cannot be type-checked, so a renamed message has to
 * fail the build rather than the render.
 */
const STATUS: Record<
  ScenarioRunStatus,
  { tone: string; label: () => I18nString; Icon: typeof Check }
> = {
  passed: { tone: 'green', label: () => m.scenario_runs_passed(), Icon: Check },
  failed: { tone: 'red', label: () => m.scenario_runs_failed(), Icon: X },
  running: {
    tone: 'blue',
    label: () => m.scenario_runs_running(),
    Icon: Loader,
  },
}

type ScenarioRunStatusBadgeProps = {
  status: ScenarioRunStatus
  size?: string
}

export const ScenarioRunStatusBadge: React.FC<ScenarioRunStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => {
  const meta = STATUS[status]
  if (!meta) return null
  return (
    <Badge
      variant="light"
      color={meta.tone}
      radius="xl"
      tt="none"
      fw={500}
      size={size}
      leftSection={<meta.Icon size={11} strokeWidth={2.4} />}
      data-testid={`scenario-run-status-${status}`}
    >
      {meta.label()}
    </Badge>
  )
}
