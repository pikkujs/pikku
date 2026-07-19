import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { DeclaredScope } from '../components/scopes/scope-tree'

export type Role = {
  name: string
  description?: string
  scopes: string[]
}

export type UserRolesData = {
  roles: string[]
  scopes: string[]
  directScopes: string[]
}

const ROLES_KEY = ['scope-roles']
const DECLARED_KEY = ['scope-declared']
const userRolesKey = (userId: string) => ['scope-user-roles', userId]

/**
 * Optimistically patches the cached user-roles snapshot so a grant/revoke is
 * reflected the instant it is clicked, then reconciles against the server. The
 * mutation reverts the snapshot on failure so a rejected authorization change
 * never lingers on screen.
 */
function optimisticUserRoles<V extends { userId: string }>(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: (data: UserRolesData, variables: V) => UserRolesData
) {
  return {
    onMutate: async (variables: V) => {
      const key = userRolesKey(variables.userId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<UserRolesData>(key)
      if (previous) {
        queryClient.setQueryData<UserRolesData>(key, patch(previous, variables))
      }
      return { key, previous }
    },
    onError: (
      _error: unknown,
      _variables: V,
      context:
        | { key: string[]; previous: UserRolesData | undefined }
        | undefined
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous)
      }
    },
    onSettled: (_data: unknown, _error: unknown, variables: V) =>
      queryClient.invalidateQueries({
        queryKey: userRolesKey(variables.userId),
      }),
  }
}

const withScope = (list: string[], scope: string) =>
  list.includes(scope) ? list : [...list, scope]

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
      })) as UserRolesData,
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
    ...optimisticUserRoles(queryClient, (data, { role }) => ({
      ...data,
      roles: data.roles.includes(role) ? data.roles : [...data.roles, role],
    })),
  })
}

export function useRemoveUserFromRole() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      rpc.invoke('console:scopeRemoveUserFromRole', input),
    ...optimisticUserRoles(queryClient, (data, { role }) => ({
      ...data,
      roles: data.roles.filter((r) => r !== role),
    })),
  })
}

export function useAddScopeToUser() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; scope: string }) =>
      rpc.invoke('console:scopeAddScopeToUser', input),
    ...optimisticUserRoles(queryClient, (data, { scope }) => ({
      ...data,
      directScopes: withScope(data.directScopes, scope),
      scopes: withScope(data.scopes, scope),
    })),
  })
}

export function useRemoveScopeFromUser() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; scope: string }) =>
      rpc.invoke('console:scopeRemoveScopeFromUser', input),
    ...optimisticUserRoles(queryClient, (data, { scope }) => ({
      ...data,
      directScopes: data.directScopes.filter((s) => s !== scope),
    })),
  })
}
