import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { KnowledgeBundle } from '../lib/knowledge'

export function useKnowledge(): {
  bundle: KnowledgeBundle | null
  isLoading: boolean
} {
  const rpc = usePikkuRPC()

  const { data, isLoading } = useQuery({
    queryKey: ['console:getKnowledge'],
    queryFn: async () =>
      (await rpc.invoke('console:getKnowledge')) as KnowledgeBundle | null,
  })

  return { bundle: data ?? null, isLoading }
}
