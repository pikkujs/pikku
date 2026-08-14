import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import { usePikkuRPC } from './PikkuRpcProvider'
import type { ResolvedPersona } from '@pikku/core/ecosystem/services'
import type { SystemRoleDefinitionsMeta } from '@pikku/core/ecosystem/role'
import type { FlattenedRPCMap } from '../pikku/rpc-map.gen.d'

type AllMeta = FlattenedRPCMap['console:getAllMeta']['output']
type MetaCounts = AllMeta['counts']
type FunctionUsedBy = AllMeta['functionUsedBy'][string]
/**
 * The addon serves `personas` and `systemRoles`, but this map is generated
 * against whatever the console was last built with, so those fields are only in
 * `AllMeta` once that codegen has re-run. Naming them here rather than asserting
 * at each reader keeps the optionality in one place, and the declaration stays
 * correct either way.
 *
 * `scenarioActors` is omitted rather than carried: a persona and a virtual user
 * are one declaration now, and a second registry keyed the same way would only
 * ever be the stale one.
 */
type PikkuMetaState = Omit<
  AllMeta,
  'counts' | 'functionUsedBy' | 'scenarioActors'
> & {
  personas: Record<string, ResolvedPersona>
  systemRoles: SystemRoleDefinitionsMeta
}

interface PikkuMetaContextType {
  meta: PikkuMetaState
  counts: MetaCounts
  functionUsedBy: Map<string, FunctionUsedBy>
  loading: boolean
  /** Loading with nothing to show yet — the only state that may blank the app.
   *  A refresh keeps the meta it already has, so the page stays where it is
   *  and only the control that asked for it reads as busy. */
  initialLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const PikkuMetaContext = createContext<PikkuMetaContextType | undefined>(
  undefined
)

export const usePikkuMeta = () => {
  const context = useContext(PikkuMetaContext)
  if (!context) {
    throw new Error('usePikkuMeta must be used within PikkuMetaProvider')
  }
  return context
}

const EMPTY_META: PikkuMetaState = {
  functions: [],
  httpMeta: [],
  cliMeta: [],
  cliRenderers: {},
  channelsMeta: {},
  queueMeta: {},
  schedulerMeta: {},
  rpcMeta: {},
  mcpMeta: [],
  gatewayMeta: [],
  workflows: {},
  personas: {},
  systemRoles: {},
  features: {},
  triggerMeta: {},
  triggerSourceMeta: {},
  middlewareGroupsMeta: {
    definitions: {},
    instances: {},
    httpGroups: {},
    tagGroups: {},
  },
  permissionsGroupsMeta: { definitions: {} },
  agentsMeta: {},
  emailsMeta: { src: '', themeHash: '', templates: {} },
  secretsMeta: {},
  credentialsMeta: {},
  variablesMeta: {},
}

const EMPTY_COUNTS: MetaCounts = {
  functions: 0,
  workflows: 0,
  httpRoutes: 0,
  channels: 0,
  mcpTools: 0,
  gateways: 0,
  schedulers: 0,
  queues: 0,
  cliCommands: 0,
  rpcMethods: 0,
  triggers: 0,
  triggerSources: 0,
  agents: 0,
  emails: 0,
  secrets: 0,
  variables: 0,
}

export const PikkuMetaProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const rpc = usePikkuRPC()
  const [meta, setMeta] = useState<PikkuMetaState>(EMPTY_META)
  const [counts, setCounts] = useState<MetaCounts>(EMPTY_COUNTS)
  const [serverFunctionUsedBy, setServerFunctionUsedBy] = useState<
    Record<string, FunctionUsedBy>
  >({})
  const [loading, setLoading] = useState(true)
  const [everLoaded, setEverLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMeta = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const allMeta = await rpc.invoke('console:getAllMeta')
      const gatewayMeta = allMeta.gatewayMeta ?? []
      setMeta({
        functions: allMeta.functions,
        httpMeta: allMeta.httpMeta,
        cliMeta: allMeta.cliMeta,
        cliRenderers: allMeta.cliRenderers,
        channelsMeta: allMeta.channelsMeta,
        queueMeta: allMeta.queueMeta,
        schedulerMeta: allMeta.schedulerMeta,
        rpcMeta: allMeta.rpcMeta,
        mcpMeta: allMeta.mcpMeta,
        gatewayMeta,
        workflows: allMeta.workflows,
        personas:
          (allMeta as { personas?: Record<string, ResolvedPersona> })
            .personas ?? {},
        systemRoles:
          (allMeta as { systemRoles?: SystemRoleDefinitionsMeta })
            .systemRoles ?? {},
        features: allMeta.features ?? {},
        triggerMeta: allMeta.triggerMeta,
        triggerSourceMeta: allMeta.triggerSourceMeta,
        middlewareGroupsMeta: allMeta.middlewareGroupsMeta,
        permissionsGroupsMeta: allMeta.permissionsGroupsMeta,
        agentsMeta: allMeta.agentsMeta,
        emailsMeta: allMeta.emailsMeta,
        secretsMeta: allMeta.secretsMeta,
        credentialsMeta: allMeta.credentialsMeta ?? {},
        variablesMeta: allMeta.variablesMeta,
      })
      setCounts({
        ...EMPTY_COUNTS,
        ...allMeta.counts,
        gateways: allMeta.counts.gateways ?? gatewayMeta.length,
      })
      setServerFunctionUsedBy(allMeta.functionUsedBy)
    } catch (e: any) {
      setError(e.message || 'Failed to load metadata')
    } finally {
      setLoading(false)
      setEverLoaded(true)
    }
  }, [rpc])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  const functionUsedBy = useMemo(() => {
    const map = new Map<string, FunctionUsedBy>()
    for (const [funcName, data] of Object.entries(serverFunctionUsedBy)) {
      map.set(funcName, data)
    }
    return map
  }, [serverFunctionUsedBy])

  return (
    <PikkuMetaContext.Provider
      value={{
        meta,
        counts,
        functionUsedBy,
        loading,
        initialLoading: loading && !everLoaded,
        error,
        refresh: loadMeta,
      }}
    >
      {children}
    </PikkuMetaContext.Provider>
  )
}
