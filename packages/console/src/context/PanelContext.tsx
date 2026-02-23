import React, { createContext, useContext, useState, useCallback } from 'react'

export type PanelType =
  | 'function'
  | 'http'
  | 'channel'
  | 'rpc'
  | 'scheduler'
  | 'queue'
  | 'cli'
  | 'mcp'
  | 'workflowStep'
  | 'workflow'
  | 'trigger'
  | 'triggerSource'
  | 'middleware'
  | 'permission'
  | 'agent'
  | 'secret'
  | 'variable'

export interface PanelData {
  type: PanelType
  id: string
  metadata?: any
}

export interface PanelHistoryEntry {
  title: string
  data: PanelData
}

export interface Panel {
  id: string
  title: string
  data: PanelData
  activeChildId?: string
  history: PanelHistoryEntry[]
}

interface PanelContextType {
  panels: Map<string, Panel>
  activePanel: string | null
  openFunction: (functionName: string, metadata?: any) => void
  openHTTPWire: (wireId: string, metadata?: any) => void
  openChannel: (channelId: string, metadata?: any) => void
  openRPC: (rpcId: string, metadata?: any) => void
  openScheduler: (schedulerId: string, metadata?: any) => void
  openQueue: (queueId: string, metadata?: any) => void
  openCLI: (cliId: string, metadata?: any) => void
  openMCP: (mcpId: string, metadata?: any) => void
  openWorkflowStep: (stepId: string, stepType: string, metadata?: any) => void
  openWorkflow: (workflowId: string, metadata?: any) => void
  openTrigger: (triggerId: string, metadata?: any) => void
  openTriggerSource: (sourceId: string, metadata?: any) => void
  openMiddleware: (middlewareId: string, metadata?: any) => void
  openPermission: (permissionId: string, metadata?: any) => void
  openAgent: (agentId: string, metadata?: any) => void
  openSecret: (secretId: string, metadata?: any) => void
  openVariable: (variableId: string, metadata?: any) => void
  navigateInPanel: (
    type: PanelType,
    id: string,
    title: string,
    metadata?: any
  ) => void
  goBack: () => void
  goBackTo: (index: number) => void
  closePanel: (id: string) => void
  setActivePanel: (id: string) => void
  setActiveChild: (panelId: string, childId: string) => void
}

const PanelContext = createContext<PanelContextType | undefined>(undefined)

export const usePanelContext = () => {
  const context = useContext(PanelContext)
  if (!context) {
    throw new Error('usePanelContext must be used within PanelProvider')
  }
  return context
}

interface PanelProviderProps {
  children: React.ReactNode
}

export const PanelProvider: React.FunctionComponent<PanelProviderProps> = ({
  children,
}) => {
  const [panels, setPanels] = useState<Map<string, Panel>>(new Map())
  const [activePanel, setActivePanelState] = useState<string | null>(null)

  const openPanelGeneric = useCallback(
    (type: PanelType, id: string, title: string, metadata?: any) => {
      const panelId = `${type}-${id}`
      setPanels((prev) => {
        const newPanels = new Map(prev)
        newPanels.set(panelId, {
          id: panelId,
          title,
          data: { type, id, metadata },
          activeChildId: 'configuration',
          history: [],
        })
        return newPanels
      })
      setActivePanelState(panelId)
    },
    []
  )

  const openFunction = useCallback(
    (functionName: string, metadata?: any) => {
      openPanelGeneric(
        'function',
        functionName,
        metadata?.summary || functionName,
        metadata
      )
    },
    [openPanelGeneric]
  )

  const openHTTPWire = useCallback(
    (wireId: string, metadata?: any) => {
      openPanelGeneric('http', wireId, wireId, metadata)
    },
    [openPanelGeneric]
  )

  const openChannel = useCallback(
    (channelId: string, metadata?: any) => {
      openPanelGeneric('channel', channelId, channelId, metadata)
    },
    [openPanelGeneric]
  )

  const openRPC = useCallback(
    (rpcId: string, metadata?: any) => {
      openPanelGeneric('rpc', rpcId, rpcId, metadata)
    },
    [openPanelGeneric]
  )

  const openScheduler = useCallback(
    (schedulerId: string, metadata?: any) => {
      openPanelGeneric('scheduler', schedulerId, schedulerId, metadata)
    },
    [openPanelGeneric]
  )

  const openQueue = useCallback(
    (queueId: string, metadata?: any) => {
      openPanelGeneric('queue', queueId, queueId, metadata)
    },
    [openPanelGeneric]
  )

  const openCLI = useCallback(
    (cliId: string, metadata?: any) => {
      openPanelGeneric('cli', cliId, cliId, metadata)
    },
    [openPanelGeneric]
  )

  const openMCP = useCallback(
    (mcpId: string, metadata?: any) => {
      openPanelGeneric('mcp', mcpId, mcpId, metadata)
    },
    [openPanelGeneric]
  )

  const openWorkflowStep = useCallback(
    (stepId: string, stepType: string, metadata?: any) => {
      const title = metadata?.stepName || metadata?.title || `${stepType} Step`
      openPanelGeneric('workflowStep', stepId, title, { ...metadata, stepType })
    },
    [openPanelGeneric]
  )

  const openWorkflow = useCallback(
    (workflowId: string, metadata?: any) => {
      const title = metadata?.name || workflowId
      openPanelGeneric('workflow', workflowId, title, metadata)
    },
    [openPanelGeneric]
  )

  const openTrigger = useCallback(
    (triggerId: string, metadata?: any) => {
      openPanelGeneric('trigger', triggerId, triggerId, metadata)
    },
    [openPanelGeneric]
  )

  const openTriggerSource = useCallback(
    (sourceId: string, metadata?: any) => {
      openPanelGeneric('triggerSource', sourceId, sourceId, metadata)
    },
    [openPanelGeneric]
  )

  const openMiddleware = useCallback(
    (middlewareId: string, metadata?: any) => {
      const title = metadata?.name || metadata?.exportedName || middlewareId
      openPanelGeneric('middleware', middlewareId, title, metadata)
    },
    [openPanelGeneric]
  )

  const openPermission = useCallback(
    (permissionId: string, metadata?: any) => {
      const title = metadata?.name || metadata?.exportedName || permissionId
      openPanelGeneric('permission', permissionId, title, metadata)
    },
    [openPanelGeneric]
  )

  const openAgent = useCallback(
    (agentId: string, metadata?: any) => {
      const title = metadata?.name || agentId
      openPanelGeneric('agent', agentId, title, metadata)
    },
    [openPanelGeneric]
  )

  const openSecret = useCallback(
    (secretId: string, metadata?: any) => {
      const title = metadata?.displayName || secretId
      openPanelGeneric('secret', secretId, title, metadata)
    },
    [openPanelGeneric]
  )

  const openVariable = useCallback(
    (variableId: string, metadata?: any) => {
      const title = metadata?.displayName || variableId
      openPanelGeneric('variable', variableId, title, metadata)
    },
    [openPanelGeneric]
  )

  const navigateInPanel = useCallback(
    (type: PanelType, id: string, title: string, metadata?: any) => {
      setPanels((prev) => {
        const currentPanelId = Array.from(prev.keys()).find(
          (key) => key === activePanel
        )
        if (!currentPanelId) return prev
        const currentPanel = prev.get(currentPanelId)
        if (!currentPanel) return prev

        const newPanels = new Map(prev)
        newPanels.set(currentPanelId, {
          ...currentPanel,
          history: [
            ...currentPanel.history,
            { title: currentPanel.title, data: currentPanel.data },
          ],
          title,
          data: { type, id, metadata },
        })
        return newPanels
      })
    },
    [activePanel]
  )

  const goBack = useCallback(() => {
    setPanels((prev) => {
      if (!activePanel) return prev
      const panel = prev.get(activePanel)
      if (!panel || panel.history.length === 0) return prev

      const newHistory = [...panel.history]
      const previous = newHistory.pop()!
      const newPanels = new Map(prev)
      newPanels.set(activePanel, {
        ...panel,
        history: newHistory,
        title: previous.title,
        data: previous.data,
      })
      return newPanels
    })
  }, [activePanel])

  const goBackTo = useCallback(
    (index: number) => {
      setPanels((prev) => {
        if (!activePanel) return prev
        const panel = prev.get(activePanel)
        if (!panel || index < 0 || index >= panel.history.length) return prev

        const entry = panel.history[index]
        const newPanels = new Map(prev)
        newPanels.set(activePanel, {
          ...panel,
          history: panel.history.slice(0, index),
          title: entry.title,
          data: entry.data,
        })
        return newPanels
      })
    },
    [activePanel]
  )

  const closePanel = useCallback(
    (id: string) => {
      setPanels((prev) => {
        const newPanels = new Map(prev)
        newPanels.delete(id)
        return newPanels
      })
      setActivePanelState((current) => {
        if (current === id) {
          const remaining = Array.from(panels.keys()).filter(
            (key) => key !== id
          )
          return remaining.length > 0 ? remaining[0] : null
        }
        return current
      })
    },
    [panels]
  )

  const setActivePanel = useCallback((id: string) => {
    setActivePanelState(id)
  }, [])

  const setActiveChild = useCallback((panelId: string, childId: string) => {
    setPanels((prev) => {
      const newPanels = new Map(prev)
      const panel = newPanels.get(panelId)
      if (panel) {
        newPanels.set(panelId, { ...panel, activeChildId: childId })
      }
      return newPanels
    })
  }, [])

  return (
    <PanelContext.Provider
      value={{
        panels,
        activePanel,
        openFunction,
        openHTTPWire,
        openChannel,
        openRPC,
        openScheduler,
        openQueue,
        openCLI,
        openMCP,
        openWorkflowStep,
        openWorkflow,
        openTrigger,
        openTriggerSource,
        openMiddleware,
        openPermission,
        openAgent,
        openSecret,
        openVariable,
        navigateInPanel,
        goBack,
        goBackTo,
        closePanel,
        setActivePanel,
        setActiveChild,
      }}
    >
      {children}
    </PanelContext.Provider>
  )
}
