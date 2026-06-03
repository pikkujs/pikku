import { createContext, useContext } from 'react'

const ConsoleEditableContext = createContext<boolean>(true)

export const ConsoleEditableProvider: React.FC<{
  editable: boolean
  children: React.ReactNode
}> = ({ editable, children }) => {
  return (
    <ConsoleEditableContext.Provider value={editable}>
      {children}
    </ConsoleEditableContext.Provider>
  )
}

/** Returns true when the console is in editable (dev) mode, false for read-only (deployed) mode. */
export function useConsoleEditable(): boolean {
  return useContext(ConsoleEditableContext)
}
