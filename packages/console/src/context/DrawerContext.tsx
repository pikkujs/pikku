import React, { createContext, useContext, useState, useCallback } from 'react'

export type CanvasDrawerType = 'addStep'

export interface CanvasDrawerData {
  type: CanvasDrawerType
  metadata?: any
}

export interface CanvasDrawer {
  id: string
  data: CanvasDrawerData
}

interface CanvasDrawerContextType {
  canvasDrawer: CanvasDrawer | null
  openAddStep: (metadata?: any) => void
  closeCanvasDrawer: () => void
}

const CanvasDrawerContext = createContext<CanvasDrawerContextType | undefined>(
  undefined
)

export const useCanvasDrawerContext = () => {
  const context = useContext(CanvasDrawerContext)
  if (!context) {
    throw new Error(
      'useCanvasDrawerContext must be used within CanvasDrawerProvider'
    )
  }
  return context
}

interface CanvasDrawerProviderProps {
  children: React.ReactNode
}

export const CanvasDrawerProvider: React.FunctionComponent<
  CanvasDrawerProviderProps
> = ({ children }) => {
  const [canvasDrawer, setCanvasDrawer] = useState<CanvasDrawer | null>(null)

  const openAddStep = useCallback((metadata?: any) => {
    setCanvasDrawer({
      id: 'add-step',
      data: { type: 'addStep', metadata },
    })
  }, [])

  const closeCanvasDrawer = useCallback(() => {
    setCanvasDrawer(null)
  }, [])

  return (
    <CanvasDrawerContext.Provider
      value={{
        canvasDrawer,
        openAddStep,
        closeCanvasDrawer,
      }}
    >
      {children}
    </CanvasDrawerContext.Provider>
  )
}
