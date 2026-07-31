import { useSearchParams, useNavigate } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useAgentItems } from './useAgentItems'

export interface AgentPlaygroundState {
  /** The agent named in the URL, or '' when none is. */
  agentId: string
  /** Its meta, or undefined when the URL names an agent that does not exist —
   *  which is the "not found" case, distinct from naming none at all. */
  agentData: unknown
  agentItems: ReturnType<typeof useAgentItems>
  selectAgent: (name: string) => void
  loading: boolean
}

/**
 * Which agent the playground is pointed at, resolved from the URL against the
 * project's meta.
 *
 * `AgentPlaygroundPage` uses this to decide between the playground and its empty
 * states. A host composing the playground panels itself — putting the
 * conversations rail in a panel of its own, say — needs the same answer to know
 * what to pass `AgentPlaygroundSurface`, and this is it rather than a second
 * copy of the resolution.
 */
export const useAgentPlaygroundState = (): AgentPlaygroundState => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { meta, loading } = usePikkuMeta()

  const agentId = searchParams.get('id') || ''

  return {
    agentId,
    agentData: meta.agentsMeta?.[agentId],
    agentItems: useAgentItems(),
    selectAgent: (name: string) =>
      navigate(`/agents/playground?id=${encodeURIComponent(name)}`),
    loading,
  }
}
