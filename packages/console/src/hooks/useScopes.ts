import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { DeclaredScope } from '../components/scopes/scope-tree'

export type Role = {
  name: string
  description?: string
  scopes: string[]
}

const ROLES_KEY = ['scope-roles']
const DECLARED_KEY = ['scope-declared']
const userRolesKey = (userId: string) => ['scope-user-roles', userId]

export function useDeclaredScopes() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: DECLARED_KEY,
    queryFn: async () =>
      (await rpc.invoke('console:scopeListDeclared')) as {
        scopes: DeclaredScope[]
      },
  })
}

export function useRoles() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: async () =>
      (await rpc.invoke('console:scopeListRoles')) as { roles: Role[] },
  })
}

export function useUserRoles(userId: string | undefined, enabled: boolean) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: userRolesKey(userId ?? ''),
    queryFn: async () =>
      (await rpc.invoke('console:scopeListUserRoles', {
        userId: userId!,
      })) as { roles: string[]; scopes: string[] },
    enabled: !!userId && enabled,
  })
}

export function useCreateRole() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      description?: string
      scopes: string[]
    }) => rpc.invoke('console:scopeCreateRole', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
  })
}

export function useSetRoleScopes() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; scopes: string[] }) =>
      rpc.invoke('console:scopeSetRoleScopes', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
  })
}

export function useDeleteRole() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      rpc.invoke('console:scopeDeleteRole', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
  })
}

export function useAddUserToRole() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      rpc.invoke('console:scopeAddUserToRole', input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: userRolesKey(variables.userId),
      }),
  })
}

export function useRemoveUserFromRole() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      rpc.invoke('console:scopeRemoveUserFromRole', input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: userRolesKey(variables.userId),
      }),
  })
}
