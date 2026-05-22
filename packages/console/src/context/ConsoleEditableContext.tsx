import { createContext, useContext } from 'react'

const ConsoleEditableContext = createContext<boolean>(true)

export function ConsoleEditableProvider({
  editable,
  children,
}: {
  editable: boolean
  children: React.ReactNode
}) {
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
