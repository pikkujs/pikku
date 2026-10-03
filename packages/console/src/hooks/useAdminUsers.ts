import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@mantine/hooks'
import type { AuthUser } from '../context/AuthContext'
import { useUserAdmin } from '../context/UserAdminContext'

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : undefined
}

/** The server answered 404: the app does not include the user-management functions at all. */
export const isUserAdminMissing = (error: unknown): boolean =>
  statusOf(error) === 404

export const describeUsersError = (error: unknown): string => {
  const status = statusOf(error)
  const message =
    error instanceof Error ? error.message : status ? '' : String(error)
  return [status ? `HTTP ${status}` : null, message || null]
    .filter(Boolean)
    .join(' — ')
}

/**
 * The user directory, through whichever caller is mounted. The search term is
 * debounced here so a host can hand over its raw input value.
 */
export const useAdminUsers = (search: string = '') => {
  const { listUsers } = useUserAdmin()
  const [debounced] = useDebouncedValue(search, 250)

  const usersQuery = useQuery({
    queryKey: ['admin-users', debounced],
    queryFn: () => listUsers(debounced || undefined),
    retry: (failures, error) => !isUserAdminMissing(error) && failures < 2,
  })

  const users: AuthUser[] = usersQuery.data ?? []
  // Ban state and session count both live on the row, so any action that
  // changes them has to bring the list back rather than patch it locally.
  const refetchUsers = () => {
    void usersQuery.refetch()
  }

  return { usersQuery, users, refetchUsers }
}
