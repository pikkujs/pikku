import { useCallback } from 'react'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { AuthProvidersPage } from './AuthProvidersPage'

export function OSSUsersPage() {
  const rpc = usePikkuRPC()

  const onReadSecret = useCallback(
    async (name: string) => {
      const result = await rpc.invoke('pikkuConsoleGetSecret', { secretId: name })
      return { exists: result.exists, value: result.value }
    },
    [rpc],
  )

  const onSaveSecret = useCallback(
    async (name: string, value: string) => {
      await rpc.invoke('pikkuConsoleSetSecret', { secretId: name, value })
    },
    [rpc],
  )

  const onDeleteSecret = useCallback(
    async (name: string) => {
      await rpc.invoke('pikkuConsoleSetSecret', { secretId: name, value: null })
    },
    [rpc],
  )

  return (
    <AuthProvidersPage
      onReadSecret={onReadSecret}
      onSaveSecret={onSaveSecret}
      onDeleteSecret={onDeleteSecret}
    />
  )
}
