import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react'
import { useSearchParams } from '../router'
import {
  useWorkflowRun,
  useWorkflowRunSteps,
  useWorkflowRunHistory,
  useWorkflowVersion,
} from '../hooks/useWorkflowRuns'
import {
  buildRunTimeline,
  reconstructStateAt,
  type RunTimeline,
  type ReconstructedRunState,
} from '@pikku/core/workflow/timeline'

interface WorkflowRunContextType {
  selectedRunId: string | null
  setSelectedRunId: (id: string | null) => void
  runData: any | null
  stepStates: Map<string, any>
  isRunActive: boolean
  isLoading: boolean
  isVersionMismatch: boolean
  historicalWorkflow: any | null
  historicalLoading: boolean
  isCreatingRun: boolean
  setIsCreatingRun: (creating: boolean) => void
  /** Ordered event stream for the selected run (empty until history loads). */
  timeline: RunTimeline
  /** Time-travel cursor: a timeline seq, or null when following the live tail. */
  timelineSeq: number | null
  setTimelineSeq: (seq: number | null) => void
  /** Run state reconstructed at `timelineSeq`; null while live. */
  reconstructed: ReconstructedRunState | null
}

const WorkflowRunContext = createContext<WorkflowRunContextType | undefined>(
  undefined
)

export const useWorkflowRunContext = () => {
  const context = useContext(WorkflowRunContext)
  if (!context) {
    throw new Error(
      'useWorkflowRunContext must be used within WorkflowRunProvider'
    )
  }
  return context
}

export const useWorkflowRunContextSafe = () => {
  return useContext(WorkflowRunContext)
}

const buildStepNameToNodeIdMap = (
  workflowNodes: Record<string, any> | undefined
): Map<string, string> => {
  const map = new Map<string, string>()
  if (!workflowNodes) return map
  const templatePatterns: Array<[string, RegExp]> = []
  for (const nodeId of Object.keys(workflowNodes)) {
    map.set(nodeId, nodeId)
    if (nodeId.includes('${')) {
      const escaped = nodeId
        .split(/\$\{[^}]+\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.+')
      templatePatterns.push([nodeId, new RegExp(`^${escaped}$`)])
    }
  }
  ;(map as any).__templatePatterns = templatePatterns
  return map
}

interface WorkflowRunProviderProps {
  children: React.ReactNode
  workflowName?: string
  currentGraphHash?: string
  workflowNodes?: Record<string, any>
}

export const WorkflowRunProvider: React.FC<WorkflowRunProviderProps> = ({
  children,
  workflowName,
  currentGraphHash,
  workflowNodes,
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialRunId = searchParams.get('runId')
  const [selectedRunId, setSelectedRunIdState] = useState<string | null>(
    initialRunId
  )
  const [isCreatingRun, setIsCreatingRun] = useState(false)

  const { data: queryRunData, isLoading: runLoading } =
    useWorkflowRun(selectedRunId)
  const { data: querySteps, isLoading: stepsLoading } =
    useWorkflowRunSteps(selectedRunId)
  const { data: queryHistory } = useWorkflowRunHistory(selectedRunId)

  const runData = queryRunData
  const steps = querySteps

  // Time-travel cursor — null follows the live tail; a number pins the canvas
  // to the run's reconstructed state at that timeline event.
  const [timelineSeq, setTimelineSeqState] = useState<number | null>(null)

  const setSelectedRunId = useCallback(
    (id: string | null) => {
      setSelectedRunIdState(id)
      if (id) {
        setIsCreatingRun(false)
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) {
            next.set('runId', id)
          } else {
            next.delete('runId')
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    const urlRunId = searchParams.get('runId')
    if (urlRunId !== selectedRunId) {
      setSelectedRunIdState(urlRunId)
    }
  }, [searchParams])

  const stepNameToNodeId = useMemo(
    () => buildStepNameToNodeIdMap(workflowNodes),
    [workflowNodes]
  )

  const resolveNodeId = useCallback(
    (stepName: string): string =>
      stepNameToNodeId.get(stepName) ??
      (stepNameToNodeId as any).__templatePatterns?.find(
        ([_, regex]: [string, RegExp]) => regex.test(stepName)
      )?.[0] ??
      stepName,
    [stepNameToNodeId]
  )

  // RPC serializes the step lifecycle Dates as ISO strings; the timeline fold
  // sorts on `.getTime()`, so rehydrate them before building.
  const timeline = useMemo<RunTimeline>(() => {
    if (!queryHistory || !Array.isArray(queryHistory)) return []
    const toDate = (v: unknown) => (v ? new Date(v as string) : undefined)
    const rehydrated = queryHistory.map((h: any) => ({
      ...h,
      createdAt: new Date(h.createdAt),
      updatedAt: new Date(h.updatedAt ?? h.createdAt),
      scheduledAt: toDate(h.scheduledAt),
      runningAt: toDate(h.runningAt),
      succeededAt: toDate(h.succeededAt),
      failedAt: toDate(h.failedAt),
    }))
    return buildRunTimeline(rehydrated as any)
  }, [queryHistory])

  // Reset the cursor to live whenever the selected run changes.
  useEffect(() => {
    setTimelineSeqState(null)
  }, [selectedRunId])

  const setTimelineSeq = useCallback(
    (seq: number | null) => {
      if (seq === null) {
        setTimelineSeqState(null)
        return
      }
      const max = timeline.length - 1
      setTimelineSeqState(Math.max(0, Math.min(seq, max)))
    },
    [timeline.length]
  )

  const reconstructed = useMemo<ReconstructedRunState | null>(
    () =>
      timelineSeq === null || timeline.length === 0
        ? null
        : reconstructStateAt(timeline, timelineSeq),
    [timeline, timelineSeq]
  )

  // Live step states (from the polled steps query) drive the canvas by default.
  const liveStepStates = useMemo(() => {
    const map = new Map<string, any>()
    if (steps && Array.isArray(steps)) {
      for (const step of steps) {
        map.set(resolveNodeId(step.stepName), step)
      }
    }
    return map
  }, [steps, resolveNodeId])

  // While scrubbing, the reconstructed state overrides live so the canvas
  // re-colors to the chosen point in time.
  const reconstructedStepStates = useMemo(() => {
    if (!reconstructed) return null
    const map = new Map<string, any>()
    for (const step of reconstructed.steps) {
      map.set(resolveNodeId(step.stepName), step)
    }
    return map
  }, [reconstructed, resolveNodeId])

  const stepStates = reconstructedStepStates ?? liveStepStates

  const isRunActive = runData?.status === 'running'
  const isLoading = runLoading || stepsLoading

  const runGraphHash = runData?.graphHash as string | undefined
  const isVersionMismatch = !!(
    selectedRunId &&
    runGraphHash &&
    currentGraphHash &&
    runGraphHash !== currentGraphHash
  )

  const { data: historicalVersion, isLoading: historicalLoading } =
    useWorkflowVersion(
      isVersionMismatch && workflowName ? workflowName : null,
      isVersionMismatch && runGraphHash ? runGraphHash : null
    )

  const historicalWorkflow = historicalVersion?.graph ?? null

  return (
    <WorkflowRunContext.Provider
      value={{
        selectedRunId,
        setSelectedRunId,
        runData,
        stepStates,
        isRunActive,
        isLoading,
        isVersionMismatch,
        historicalWorkflow,
        historicalLoading,
        isCreatingRun,
        setIsCreatingRun,
        timeline,
        timelineSeq,
        setTimelineSeq,
        reconstructed,
      }}
    >
      {children}
    </WorkflowRunContext.Provider>
  )
}
