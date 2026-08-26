import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { PassphraseForm } from '../components/PassphraseForm'
import { dataLock } from '../lib/data-lock-client'
import { lockStore } from '../lib/lock-store'
import { usePassphraseAttempt } from '../lib/use-passphrase-attempt'

export const Route = createFileRoute('/initialize')({
  beforeLoad: async () => {
    const { state } = await lockStore.ensure()
    if (state !== 'uninitialized') {
      throw redirect({ to: state === 'locked' ? '/unlock' : '/' })
    }
  },
  component: InitializePage,
})

function InitializePage() {
  const navigate = useNavigate()
  const { submit, pending, error, lockedOutFor } = usePassphraseAttempt(
    dataLock.initialize
  )

  return (
    <PassphraseForm
      heading="Choose a passphrase"
      explanation="This store has never been opened. The passphrase you pick here seals it, and there is no way to recover it — nothing else in the system ever sees it."
      submitLabel="Initialize"
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
