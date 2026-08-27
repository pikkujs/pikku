import { useCallback, useEffect, useState } from 'react'
import { DataLockRequestError, type DataLockStatus } from './data-lock-client'
import { lockStore } from './lock-store'
import { useCountdown } from './use-countdown'

export type PassphraseAttempt = {
  submit: (passphrase: string) => Promise<void>
  pending: boolean
  error: string | null
  /** Milliseconds left in the lockout window, or 0 when there is none. */
  lockedOutFor: number
}

/**
 * Drives one passphrase form — unlock, or first-run initialize.
 *
 * The three answers the gate gives are the three states worth distinguishing:
 * 403 means the passphrase was wrong and says nothing about how wrong, 429
 * means a lockout window is open and the wait has to be shown rather than
 * discovered, and success is the only thing that moves the store on.
 */
export const usePassphraseAttempt = (
  attempt: (passphrase: string) => Promise<DataLockStatus>
): PassphraseAttempt => {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deadline, setDeadline] = useState(0)
  const lockedOutFor = useCountdown(deadline)

  // A window that opened before this screen was mounted — a reload during a
  // lockout — is still running, and the form has to respect it.
  useEffect(() => {
    const status = lockStore.snapshot()
    if (status && status.retryAfterMs > 0) {
      setDeadline(Date.now() + status.retryAfterMs)
    }
  }, [])

  const submit = useCallback(
    async (passphrase: string) => {
      setPending(true)
      setError(null)
      try {
        lockStore.set(await attempt(passphrase))
        setDeadline(0)
      } catch (caught) {
        if (!(caught instanceof DataLockRequestError)) {
          setError('Could not reach the server. Try again.')
          return
        }
        if (caught.status === 429) {
          const status = await lockStore.refresh()
          setDeadline(Date.now() + status.retryAfterMs)
          setError(null)
          return
        }
        setError(
          caught.status === 403
            ? 'That passphrase does not open this store.'
            : `The server refused the request (${caught.status}).`
        )
      } finally {
        setPending(false)
      }
    },
    [attempt]
  )

  return { submit, pending, error, lockedOutFor }
}
