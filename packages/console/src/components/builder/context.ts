import { createContext, useContext } from 'react'

export type BuilderSandboxData = {
  runtimeBaseUrl: string | null
  builderToken: string | null
}

export const BuilderSandboxCtx = createContext<BuilderSandboxData>({ runtimeBaseUrl: 'local', builderToken: 'local' })

export function useBuilderSandbox(): BuilderSandboxData {
  return useContext(BuilderSandboxCtx)
}
