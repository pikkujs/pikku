import React, { createContext, useContext, useState, useCallback } from 'react'

interface WorkflowContextType {
  workflow: any
  getNode: (nodeId: string) => any | undefined
  findNodeByOutputVar: (outputVar: string) => string | undefined
  focusedNodeId: string | null
  referencedNodeId: string | null
  setFocusedNode: (nodeId: string | null) => void
  setReferencedNode: (nodeId: string | null) => void
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(
  undefined
)

export const useWorkflowContext = () => {
  const context = useContext(WorkflowContext)
  if (!context) {
    throw new Error('useWorkflowContext must be used within WorkflowProvider')
  }
  return context
}

export const useWorkflowContextSafe = () => {
  return useContext(WorkflowContext)
}

export const useWorkflowNode = (nodeId: string) => {
  const { getNode } = useWorkflowContext()
  return getNode(nodeId)
}

interface WorkflowProviderProps {
  children: React.ReactNode
  workflow: any
}

export const WorkflowProvider: React.FunctionComponent<
  WorkflowProviderProps
> = ({ children, workflow }) => {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [referencedNodeId, setReferencedNodeId] = useState<string | null>(null)

  const getNode = useCallback(
    (nodeId: string) => {
      return workflow?.nodes?.[nodeId]
    },
    [workflow]
  )

  const findNodeByOutputVar = useCallback(
    (outputVar: string): string | undefined => {
      if (!workflow?.nodes) return undefined
      for (const [nodeId, node] of Object.entries(workflow.nodes)) {
        if ((node as any).outputVar === outputVar) {
          return nodeId
        }
      }
      return undefined
    },
    [workflow]
  )

  const setFocusedNode = useCallback((nodeId: string | null) => {
    setFocusedNodeId(nodeId)
  }, [])

  const setReferencedNode = useCallback((nodeId: string | null) => {
    setReferencedNodeId(nodeId)
  }, [])

  return (
    <WorkflowContext.Provider
      value={{
        workflow,
        getNode,
        findNodeByOutputVar,
        focusedNodeId,
        referencedNodeId,
        setFocusedNode,
        setReferencedNode,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  )
}
