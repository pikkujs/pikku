import { useCallback, useEffect, useRef, useState } from 'react'
import 'altcha'

type Status =
  'loading' | 'idle' | 'verifying' | 'verified' | 'expired' | 'error'

interface AltchaElement extends HTMLElement {
  configure(options: Record<string, unknown>): void
  verify(): void
  reset(): void
}

export interface CaptchaFieldProps {
  /** Fetches a fresh challenge, for example `() => rpc.invoke('captcha:getChallenge')`. */
  getChallenge: () => Promise<unknown>
  /** Called with the payload once solved, and with `null` whenever it is no longer usable. */
  onChange: (payload: string | null) => void
  /** Change it after every submit: a payload is single-use, so the field fetches a new challenge. */
  resetKey?: number
  className?: string
}

const LABEL: Record<Status, string> = {
  loading: 'Preparing…',
  idle: "I'm not a robot",
  verifying: 'Checking…',
  verified: 'Verified',
  expired: 'Expired, tap to check again',
  error: 'Something went wrong, tap to retry',
}

/**
 * The ALTCHA widget behind our own button. The widget does the proof-of-work
 * in a worker and stays hidden; this component owns every state the visitor sees.
 */
export function CaptchaField({
  getChallenge,
  onChange,
  resetKey = 0,
  className = '',
}: CaptchaFieldProps) {
  const host = useRef<HTMLDivElement>(null)
  const widget = useRef<AltchaElement | null>(null)
  const latest = useRef({ getChallenge, onChange })
  latest.current = { getChallenge, onChange }
  const [status, setStatus] = useState<Status>('loading')

  const load = useCallback(async (after: Status = 'idle') => {
    const el = widget.current
    if (!el) return
    setStatus('loading')
    latest.current.onChange(null)
    try {
      const challenge = await latest.current.getChallenge()
      el.reset()
      el.configure({ challenge, auto: 'off' })
      setStatus(after)
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const el = document.createElement('altcha-widget') as AltchaElement
    host.current?.appendChild(el)
    widget.current = el
    const onState = (event: Event) => {
      const { state, payload } = (
        event as CustomEvent<{ state: string; payload: string | null }>
      ).detail
      if (state === 'verifying') setStatus('verifying')
      else if (state === 'verified') {
        setStatus('verified')
        latest.current.onChange(payload)
      } else if (state === 'expired') {
        latest.current.onChange(null)
        void load('expired')
      } else if (state === 'error') {
        latest.current.onChange(null)
        setStatus('error')
      }
    }
    el.addEventListener('statechange', onState)
    void load()
    return () => {
      el.removeEventListener('statechange', onState)
      el.remove()
      widget.current = null
    }
  }, [load])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void load()
  }, [resetKey, load])

  const busy = status === 'loading' || status === 'verifying'
  const done = status === 'verified'

  return (
    <div className={className}>
      <div ref={host} hidden />
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-busy={busy}
        disabled={busy || done}
        onClick={() => widget.current?.verify()}
        className={[
          'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
          done
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : status === 'error' || status === 'expired'
              ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'flex size-5 shrink-0 items-center justify-center rounded border text-xs',
            done
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-400 bg-white',
            busy ? 'animate-pulse' : '',
          ].join(' ')}
        >
          {done ? '✓' : ''}
        </span>
        <span aria-live="polite">{LABEL[status]}</span>
      </button>
    </div>
  )
}
