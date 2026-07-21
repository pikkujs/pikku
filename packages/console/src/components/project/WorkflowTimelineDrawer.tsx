import React, { useMemo } from 'react'
import {
  Box,
  Group,
  Stack,
  Text,
  Tooltip,
  Collapse,
  ScrollArea,
  Slider,
  ActionIcon,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import {
  reconstructStateAt,
  reconstructFinalState,
} from '@pikku/core/workflow/timeline'
import type { StepStatus } from '@pikku/core/workflow/types'
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Radio,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { useWorkflowRunContextSafe } from '../../context/WorkflowRunContext'

// Mirror of the canvas node status palette so a step's pill matches its node.
const statusColor: Record<string, string> = {
  succeeded: 'var(--pikku-status-succeeded, var(--mantine-color-green-5))',
  failed: 'var(--pikku-status-failed, var(--mantine-color-red-5))',
  running: 'var(--pikku-status-running, var(--mantine-color-blue-5))',
  scheduled: 'var(--pikku-status-scheduled, var(--mantine-color-orange-5))',
  pending: 'var(--pikku-status-pending, var(--mantine-color-gray-4))',
  suspended: 'var(--pikku-status-suspended, var(--mantine-color-yellow-5))',
}

const colorFor = (status?: StepStatus): string =>
  (status && statusColor[status]) || 'var(--mantine-color-gray-3)'

/**
 * Bottom drawer that turns a run's durable history into a linear, scrubbable
 * timeline. Dragging the scrubber (or clicking a step) time-travels: the
 * WorkflowRunContext reconstructs the run's state at that point and the canvas
 * above re-colors to match. Following the live tail clears the override.
 */
export const WorkflowTimelineDrawer: React.FC = () => {
  const ctx = useWorkflowRunContextSafe()
  const [open, setOpen] = React.useState(true)

  const timeline = ctx?.timeline ?? []
  const hasTimeline = timeline.length > 0

  // Stable step order (the full walked path) for the linear pill strip, and the
  // last event seq per step so clicking a pill jumps to where it settled.
  const { path, lastSeqByStep } = useMemo(() => {
    if (!hasTimeline)
      return { path: [] as string[], lastSeqByStep: new Map<string, number>() }
    const lastSeqByStep = new Map<string, number>()
    for (const e of timeline) lastSeqByStep.set(e.stepName, e.seq)
    return { path: reconstructFinalState(timeline).path, lastSeqByStep }
  }, [timeline, hasTimeline])

  if (!ctx || !ctx.selectedRunId || !hasTimeline) return null

  const maxSeq = timeline.length - 1
  const isLive = ctx.timelineSeq === null
  const cursor = ctx.timelineSeq ?? maxSeq
  // State at the cursor — drives pill colours and the read-out.
  const current = reconstructStateAt(timeline, cursor)
  const statusByStep = new Map(current.steps.map((s) => [s.stepName, s]))
  const cursorEvent = timeline[cursor]
  const activeStep = cursorEvent?.stepName

  const marks = path.map((name) => ({ value: lastSeqByStep.get(name) ?? 0 }))

  const jumpTo = (seq: number) => ctx.setTimelineSeq(seq)
  const goLive = () => ctx.setTimelineSeq(null)

  return (
    <Box
      data-testid="workflow-timeline"
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Group justify="space-between" px="md" py={6} wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Clock size={16} />
          <Text size="sm" fw={600}>
            {asI18n('Timeline')}
          </Text>
          <Text size="xs" c="dimmed">
            {isLive
              ? asI18n('Live')
              : asI18n(`Step ${cursor + 1} of ${timeline.length}`)}
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          {!isLive && (
            <Tooltip label={asI18n('Follow live')} withinPortal>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                onClick={goLive}
                aria-label={asI18n('Follow live')}
              >
                <Radio size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={() => setOpen((o) => !o)}
            aria-label={asI18n('Toggle timeline')}
          >
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </ActionIcon>
        </Group>
      </Group>

      <Collapse expanded={open}>
        <Stack gap="xs" px="md" pb="sm">
          <ScrollArea type="hover" scrollbarSize={6}>
            <Group gap={6} wrap="nowrap" py={2}>
              {path.map((name) => {
                const step = statusByStep.get(name)
                const reached = step !== undefined
                const seq = lastSeqByStep.get(name) ?? 0
                return (
                  <UnstyledButton
                    key={name}
                    data-step={name}
                    onClick={() => jumpTo(seq)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 8px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      opacity: reached ? 1 : 0.45,
                      border:
                        name === activeStep
                          ? '1px solid var(--mantine-color-blue-5)'
                          : '1px solid transparent',
                      background:
                        name === activeStep
                          ? 'var(--mantine-color-blue-light)'
                          : 'var(--mantine-color-default-hover)',
                    }}
                  >
                    <Box
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: colorFor(step?.status),
                        flexShrink: 0,
                      }}
                    />
                    <Text size="xs">{asI18n(name)}</Text>
                  </UnstyledButton>
                )
              })}
            </Group>
          </ScrollArea>

          <Group gap="sm" wrap="nowrap" align="center">
            <ActionIcon
              size="sm"
              variant="default"
              disabled={cursor <= 0}
              onClick={() => jumpTo(cursor - 1)}
              aria-label={asI18n('Previous event')}
            >
              <SkipBack size={14} />
            </ActionIcon>
            <Box style={{ flex: 1 }}>
              <Slider
                min={0}
                max={maxSeq}
                value={cursor}
                marks={marks}
                label={(v) => timeline[v]?.stepName ?? ''}
                onChange={jumpTo}
                size="sm"
              />
            </Box>
            <ActionIcon
              size="sm"
              variant="default"
              disabled={cursor >= maxSeq}
              onClick={() => jumpTo(cursor + 1)}
              aria-label={asI18n('Next event')}
            >
              <SkipForward size={14} />
            </ActionIcon>
          </Group>

          {cursorEvent && (
            <Group gap="xs" wrap="nowrap" align="baseline">
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: colorFor(
                    activeStep
                      ? statusByStep.get(activeStep)?.status
                      : undefined
                  ),
                  flexShrink: 0,
                }}
              />
              <Text size="sm" fw={500}>
                {asI18n(cursorEvent.stepName)}
              </Text>
              <Text size="xs" c="dimmed">
                {asI18n(cursorEvent.type)}
              </Text>
              {cursorEvent.fromStepName && (
                <Text size="xs" c="dimmed">
                  {asI18n(`← ${cursorEvent.fromStepName}`)}
                </Text>
              )}
            </Group>
          )}
        </Stack>
      </Collapse>
    </Box>
  )
}
