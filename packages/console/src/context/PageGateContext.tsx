import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * Host applications can provide a ReactNode here to replace the body of any
 * PageContainer or TableListPage while keeping the page header visible.
 * Useful for "no active deployment" gates in platforms that embed the console.
 */
export const PageGateContext = createContext<ReactNode>(null)

export function usePageGate(): ReactNode {
  return useContext(PageGateContext)
}
