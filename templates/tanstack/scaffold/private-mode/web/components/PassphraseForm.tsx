import type * as React from 'react'
import { useState } from 'react'

export type PassphraseFormProps = {
  heading: string
  explanation: string
  submitLabel: string
  pending: boolean
  error: string | null
  /** Milliseconds left in a lockout window, or 0 when the form is free. */
  lockedOutFor: number
  onSubmit: (passphrase: string) => void
}

const seconds = (ms: number) => Math.ceil(ms / 1000)

export const PassphraseForm: React.FC<PassphraseFormProps> = ({
  heading,
  explanation,
  submitLabel,
  pending,
  error,
  lockedOutFor,
  onSubmit,
}) => {
  const [passphrase, setPassphrase] = useState('')
  const lockedOut = lockedOutFor > 0
  const disabled = pending || lockedOut

  return (
    <section className="card">
      <h2>{heading}</h2>
      <p>{explanation}</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (!disabled && passphrase) {
            onSubmit(passphrase)
          }
        }}
      >
        <label htmlFor="passphrase">Passphrase</label>
        <input
          id="passphrase"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={passphrase}
          disabled={disabled}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <p className={lockedOut ? 'notice waiting' : 'notice'} role="status">
          {lockedOut
            ? `Too many attempts. Try again in ${seconds(lockedOutFor)}s.`
            : (error ?? '')}
        </p>
        <button type="submit" disabled={disabled || !passphrase}>
          {pending ? 'Working…' : submitLabel}
        </button>
      </form>
    </section>
  )
}
