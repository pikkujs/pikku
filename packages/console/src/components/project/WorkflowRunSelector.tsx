import React, { useState, useMemo } from 'react'
import {
  Group,
  Text,
  Popover,
  Stack,
  UnstyledButton,
  ScrollArea,
  SegmentedControl,
  ActionIcon,
  Box,
  Loader,
} from '@mantine/core'
import { ChevronDown, X } from 'lucide-react'
import { useWorkflowRuns } from '@/hooks/useWorkflowRuns'
import { useWorkflowRunContext } from '@/context/WorkflowRunContext'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { statusDefs } from '@/components/ui/badge-defs'

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

interface WorkflowRunSelectorProps {
  workflowName: string
}

export const WorkflowRunSelector: React.FunctionComponent<
  WorkflowRunSelectorProps
> = ({ workflowName }) => {
  const [opened, setOpened] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const { selectedRunId, setSelectedRunId, runData, isLoading } =
    useWorkflowRunContext()

  const { data: runs, isLoading: runsLoading } = useWorkflowRuns(
    workflowName,
    statusFilter === 'all' ? undefined : statusFilter
  )

  const filteredRuns = useMemo(() => {
    if (!runs || !Array.isArray(runs)) return []
    return runs
  }, [runs])

  const handleSelect = (runId: string) => {
    setSelectedRunId(runId)
    setOpened(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedRunId(null)
  }

  const selectedRun =
    runData || filteredRuns?.find((r: any) => r.id === selectedRunId)

  return (
    <Group gap="xs">
      <Popover
        opened={opened}
        onChange={setOpened}
        width={360}
        position="bottom-end"
        shadow="md"
        zIndex={10000}
      >
        <Popover.Target>
          <UnstyledButton
            onClick={() => setOpened((o) => !o)}
            px="sm"
            py={4}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--mantine-color-gray-4)',
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            {isLoading ? (
              <Loader size={12} />
            ) : selectedRun ? (
              <>
                <PikkuBadge
                  type="label"
                  color={statusDefs[selectedRun.status]?.color || 'gray'}
                  variant="filled"
                  circle
                >
                  {' '}
                </PikkuBadge>
                <Text size="sm" ff="monospace" truncate maw={120}>
                  {selectedRun.id.slice(0, 8)}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatTime(selectedRun.createdAt)}
                </Text>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Select run...
              </Text>
            )}
            <ChevronDown size={14} />
          </UnstyledButton>
        </Popover.Target>

        <Popover.Dropdown p={0}>
          <Box
            px="sm"
            py="xs"
            style={{
              borderBottom: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <SegmentedControl
              size="xs"
              fullWidth
              value={statusFilter}
              onChange={setStatusFilter}
              data={[
                { value: 'all', label: 'All' },
                { value: 'running', label: 'Running' },
                { value: 'completed', label: 'Completed' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </Box>

          <ScrollArea.Autosize mah={300}>
            {runsLoading ? (
              <Box p="md" ta="center">
                <Loader size="sm" />
              </Box>
            ) : filteredRuns.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No runs found
              </Text>
            ) : (
              <Stack gap={0}>
                {filteredRuns.map((run: any) => (
                  <UnstyledButton
                    key={run.id}
                    onClick={() => handleSelect(run.id)}
                    py="xs"
                    px="sm"
                    style={{
                      backgroundColor:
                        run.id === selectedRunId
                          ? 'var(--mantine-color-blue-light)'
                          : undefined,
                    }}
                  >
                    <Group gap="xs" justify="space-between">
                      <Group gap="xs">
                        <PikkuBadge
                          type="label"
                          color={statusDefs[run.status]?.color || 'gray'}
                          variant="filled"
                          circle
                        >
                          {' '}
                        </PikkuBadge>
                        <Text size="sm" ff="monospace">
                          {run.id.slice(0, 8)}
                        </Text>
                        <PikkuBadge type="status" value={run.status} />
                      </Group>
                      <Text size="xs" c="dimmed">
                        {formatTime(run.createdAt)}
                      </Text>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            )}
          </ScrollArea.Autosize>
        </Popover.Dropdown>
      </Popover>

      {selectedRunId && (
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleClear}
          title="Clear run selection"
        >
          <X size={14} />
        </ActionIcon>
      )}
    </Group>
  )
}
