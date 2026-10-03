import React, { useMemo } from 'react'
import { Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Check, X, Loader, Pause } from 'lucide-react'
import { useWorkflowRuns } from '../../hooks/useWorkflowRuns'

const relativeTime = (iso?: string): string => {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const min = Math.round((Date.now() - then) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

const STATUS_META: Record<
  string,
  { tone: string; label: string; Icon: typeof Check }
> = {
  completed: { tone: 'green', label: 'passed', Icon: Check },
  failed: { tone: 'red', label: 'failed', Icon: X },
  cancelled: { tone: 'red', label: 'cancelled', Icon: X },
  running: { tone: 'blue', label: 'running', Icon: Loader },
  suspended: { tone: 'yellow', label: 'suspended', Icon: Pause },
}

type ScenarioRunPillProps = {
  scenarioName: string
}

/**
 * Run status as marginalia — a scenario is a specification first, so its last
 * result decorates the section rather than titling it.
 */
export const ScenarioRunPill: React.FC<ScenarioRunPillProps> = ({
  scenarioName,
}) => {
  const { data: runs } = useWorkflowRuns(scenarioName)

  const lastRun = useMemo(() => {
    const list = (runs as { status: string; startedAt?: string }[]) ?? []
    return [...list].sort(
      (a, b) =>
        new Date(b.startedAt ?? 0).getTime() -
        new Date(a.startedAt ?? 0).getTime()
    )[0]
  }, [runs])

  const status = lastRun ? STATUS_META[lastRun.status] : undefined
  if (!status) return null

  return (
    <Badge
      variant="light"
      color={status.tone}
      radius="xl"
      tt="none"
      fw={500}
      leftSection={<status.Icon size={11} strokeWidth={2.4} />}
      data-testid={`scenario-status-${scenarioName}`}
    >
      {asI18n(`${status.label} · ${relativeTime(lastRun?.startedAt)}`)}
    </Badge>
  )
}
