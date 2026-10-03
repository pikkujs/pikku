import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { FlagBoardRow } from '../components/flags/flag-lanes'

/** Who an override is about. The organization wins wherever both are known. */
export type FlagSubject = {
  organizationId?: string
  userId?: string
}

export type FlagOverride = {
  subjectId: string
  subjectKind: string
  enabled: boolean
  grantedBy?: string
  grantedAt?: string
}

export type FlagListData = {
  flags: FlagBoardRow[]
  /** A pikku-owned store, rather than a provider that only reads. Every control
   *  on the board is off when this is false. */
  writable: boolean
}

export type FlagOverridesData = {
  overrides: FlagOverride[]
  /** A provider keeps its overrides to itself, and an empty list would read as
   *  "nobody is overridden" — the opposite of what is known. */
  supported: boolean
}

const FLAGS_KEY = ['feature-flags']
const overridesKey = (name: string) => ['feature-flag-overrides', name]

export function useFeatureFlags() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: FLAGS_KEY,
    queryFn: async () => (await rpc.invoke('admin:flagList')) as FlagListData,
  })
}

export function useFlagOverrides(name: string | undefined, enabled: boolean) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: overridesKey(name ?? ''),
    queryFn: async () =>
      (await rpc.invoke('admin:flagOverrides', {
        name: name!,
      })) as FlagOverridesData,
    enabled: !!name && enabled,
  })
}

export function useSetFlagEnabled() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; enabled: boolean; note?: string }) =>
      rpc.invoke('admin:flagSetEnabled', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FLAGS_KEY }),
  })
}

export function useSetFlagRollout() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; percent: number | null }) =>
      rpc.invoke('admin:flagSetRollout', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FLAGS_KEY }),
  })
}

export function useSetFlagOverride() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      subject: FlagSubject
      enabled: boolean
    }) => rpc.invoke('admin:flagSetOverride', input),
    onSuccess: (_data, { name }) =>
      queryClient.invalidateQueries({ queryKey: overridesKey(name) }),
  })
}

export function useClearFlagOverride() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; subject: FlagSubject }) =>
      rpc.invoke('admin:flagClearOverride', input),
    onSuccess: (_data, { name }) =>
      queryClient.invalidateQueries({ queryKey: overridesKey(name) }),
  })
}

export function useSyncFlags() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await rpc.invoke('admin:flagSync')) as { synced: number },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FLAGS_KEY }),
  })
}

export function usePruneFlags() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await rpc.invoke('admin:flagPrune')) as { pruned: string[] },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FLAGS_KEY }),
  })
}
