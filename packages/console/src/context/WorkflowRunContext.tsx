import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useWorkflowRun,
  useWorkflowRunSteps,
  useWorkflowVersion,
} from '@/hooks/useWorkflowRuns'

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

export const WorkflowRunProvider: React.FunctionComponent<
  WorkflowRunProviderProps
> = ({ children, workflowName, currentGraphHash, workflowNodes }) => {
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

  const runData = queryRunData
  const steps = querySteps

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

  const stepStates = useMemo(() => {
    const map = new Map<string, any>()
    if (steps && Array.isArray(steps)) {
      for (const step of steps) {
        const nodeId =
          stepNameToNodeId.get(step.stepName) ??
          (stepNameToNodeId as any).__templatePatterns?.find(
            ([_, regex]: [string, RegExp]) => regex.test(step.stepName)
          )?.[0] ??
          step.stepName
        map.set(nodeId, step)
      }
    }
    return map
  }, [steps, stepNameToNodeId])

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
      }}
    >
      {children}
    </WorkflowRunContext.Provider>
  )
}
