import React, { useMemo, useCallback } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useWorkflowRunContext } from '../../context/WorkflowRunContext'
import { usePanelContext } from '../../context/PanelContext'
import { useConsoleEditable } from '../../context/ConsoleEditableContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useWorkflowSurface } from '../../context/WorkflowSurfaceContext'
import { useWorkflowRuns } from '../../hooks/useWorkflowRuns'
import { RunsPanel, type RunItem } from '../layout/RunsPanel'

/**
 * The run history for the surface's workflow. Mount anywhere under a
 * `WorkflowSurface` that was not created `readOnly`.
 */
export const WorkflowRunsPanel: React.FC = () => {
  useLocale()
  const { workflowName, runsWorkflowName } = useWorkflowSurface()
  const { selectedRunId, setSelectedRunId, setIsCreatingRun } =
    useWorkflowRunContext()
  const { setActivePanel } = usePanelContext()
  const editable = useConsoleEditable()
  const rpc = usePikkuRPC()
  const { data: runs, isLoading, refetch } = useWorkflowRuns(runsWorkflowName)

  const runItems: RunItem[] = useMemo(() => {
    if (!runs || !Array.isArray(runs)) return []
    return runs
  }, [runs])

  const handleDelete = useCallback(
    async (runId: string) => {
      await rpc.invoke('console:deleteWorkflowRun', { runId })
      if (selectedRunId === runId) {
        setSelectedRunId(null)
      }
      refetch()
    },
    [rpc, selectedRunId, setSelectedRunId, refetch]
  )

  const handleNewClick = useCallback(() => {
    setSelectedRunId(null)
    setIsCreatingRun(true)
    setActivePanel(`workflow-${workflowName}`)
  }, [setSelectedRunId, setIsCreatingRun, setActivePanel, workflowName])

  return (
    <RunsPanel
      title="Runs"
      runs={runItems}
      selectedId={selectedRunId}
      onSelect={setSelectedRunId}
      onClear={() => setSelectedRunId(null)}
      loading={isLoading}
      emptyMessage={m.runs_panel_empty()}
      statusFilters={[]}
      onNewClick={editable ? handleNewClick : undefined}
      newButtonLabel={editable ? m.workflow_runs_new() : undefined}
      onDelete={editable ? handleDelete : undefined}
    />
  )
}
