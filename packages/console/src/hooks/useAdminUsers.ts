import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@mantine/hooks'
import type { AuthUser } from '../context/AuthContext'
import { useUserAdmin } from '../context/UserAdminContext'

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
  })

  const users: AuthUser[] = usersQuery.data ?? []
  // Ban state and session count both live on the row, so any action that
  // changes them has to bring the list back rather than patch it locally.
  const refetchUsers = () => {
    void usersQuery.refetch()
  }

  return { usersQuery, users, refetchUsers }
}
