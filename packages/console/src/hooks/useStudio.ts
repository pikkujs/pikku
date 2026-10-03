import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export type StudioMode = 'local' | 'fabric'

export type StudioChangeStatus =
  'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'

export interface StudioChange {
  changeId: string
  shortId: string
  title: string
  body: string | null
  status: StudioChangeStatus
  source: 'panel' | 'console' | 'system' | 'studio'
  route: string | null
  createdAt: string
}

export interface StudioWish {
  title: string
  line: string
  reaction: 'liked' | 'disliked' | null
}

export interface StudioWishList {
  wishes: StudioWish[]
  status: 'ready' | 'generating' | 'unavailable'
  reason?: string
}

type Invoke = (name: string, data?: unknown) => Promise<unknown>

const useInvoke = (): Invoke => {
  const rpc = usePikkuRPC()
  return (name, data) => (rpc.invoke as unknown as Invoke)(name, data ?? null)
}

export function useStudioChanges() {
  const invoke = useInvoke()
  return useQuery({
    queryKey: ['console:listStudioChanges'],
    queryFn: async () =>
      (await invoke('console:listStudioChanges', {})) as {
        mode: StudioMode
        changes: StudioChange[]
      },
  })
}

export function useStudioChangeAction() {
  const invoke = useInvoke()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (
      action:
        | { kind: 'create'; title: string; body?: string; route?: string }
        | {
            kind: 'status'
            changeId: string
            status: 'open' | 'in_progress' | 'dismissed'
          }
        | { kind: 'complete'; changeId: string; note?: string }
        | { kind: 'reply'; changeId: string; body: string }
    ) => {
      if (action.kind === 'create') {
        const { kind: _, ...input } = action
        return invoke('console:createStudioChange', input)
      }
      if (action.kind === 'status') {
        return invoke('console:setStudioChangeStatus', {
          changeId: action.changeId,
          status: action.status,
        })
      }
      if (action.kind === 'complete') {
        return invoke('console:completeStudioChange', {
          changeId: action.changeId,
          note: action.note,
        })
      }
      return invoke('console:replyToStudioChange', {
        changeId: action.changeId,
        body: action.body,
      })
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['console:listStudioChanges'] }),
  })
}

export function useStudioWishes() {
  const invoke = useInvoke()
  return useQuery({
    queryKey: ['console:listStudioWishes'],
    queryFn: async () =>
      (await invoke('console:listStudioWishes')) as StudioWishList,
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' ? 2000 : false,
  })
}

export function useReactToWish() {
  const invoke = useInvoke()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; reaction: StudioWish['reaction'] }) =>
      invoke('console:reactToStudioWish', input),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['console:listStudioWishes'] }),
  })
}
