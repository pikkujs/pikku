import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { PassphraseForm } from '../components/PassphraseForm'
import { dataLock } from '../lib/data-lock-client'
import { lockStore } from '../lib/lock-store'
import { usePassphraseAttempt } from '../lib/use-passphrase-attempt'

export const Route = createFileRoute('/unlock')({
  beforeLoad: async () => {
    const { state } = await lockStore.ensure()
    if (state === 'uninitialized') {
      throw redirect({ to: '/initialize' })
    }
    if (state === 'unlocked') {
      throw redirect({ to: '/' })
    }
  },
  component: UnlockPage,
})

function UnlockPage() {
  const navigate = useNavigate()
  const { submit, pending, error, lockedOutFor } = usePassphraseAttempt(
    dataLock.unlock
  )

  return (
    <PassphraseForm
      heading="Unlock this store"
      explanation="The server is running but its data is sealed. Enter the passphrase to open it — this page is the only place it is ever typed."
      submitLabel="Unlock"
      pending={pending}
      error={error}
      lockedOutFor={lockedOutFor}
      onSubmit={async (passphrase) => {
        await submit(passphrase)
        if (lockStore.snapshot()?.state === 'unlocked') {
          await navigate({ to: '/' })
        }
      }}
    />
  )
}
