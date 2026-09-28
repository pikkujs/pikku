import { createContext, useContext } from 'react'

export const ShellHeaderSlotContext = createContext<HTMLElement | null>(null)

export function useShellHeaderSlot(): HTMLElement | null {
  return useContext(ShellHeaderSlotContext)
}
