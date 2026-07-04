import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@pikku/mantine/core'
import { Zap } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useAuth } from '../../context/AuthContext'
import {
  fetchDevQuickLoginStatus,
  postDevQuickLogin,
} from '../../lib/dev-quick-login'

type Props = { serverUrl: string }

/**
 * One-click sign-in for local development. Renders nothing unless the target
 * server is a loopback address AND reports the dev quick-login endpoint as
 * enabled (only the pikku dev server does). Clicking signs in as the seeded
 * dev admin and reuses the normal session flow.
 */
export const DevQuickLoginButton: React.FC<Props> = ({ serverUrl }) => {
  const { setServerUrl, refetchSession } = useAuth()

  const status = useQuery({
    queryKey: ['dev-quick-login', serverUrl],
    queryFn: () => fetchDevQuickLoginStatus(serverUrl),
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      await postDevQuickLogin(serverUrl)
      setServerUrl(serverUrl)
      await refetchSession()
    },
  })

  if (!status.data?.enabled) {
    return null
  }

  return (
    <Button
      variant="light"
      fullWidth
      leftSection={<Zap size={16} />}
      loading={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {m.auth_dev_quick_login({ email: status.data.email })}
    </Button>
  )
}
