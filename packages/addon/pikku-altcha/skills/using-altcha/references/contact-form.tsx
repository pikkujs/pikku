import { useState, type FormEvent } from 'react'
import { CaptchaField } from './captcha-field'
// Your app's RPC client; any client that calls `submitContact` and `captcha:getChallenge` works.
import { rpc } from './rpc'

const REFUSALS: Record<string, string> = {
  CAPTCHA_INVALID: 'Please complete the check and try again.',
  CAPTCHA_EXPIRED: 'The check expired. Please do it again.',
  CAPTCHA_REUSED: 'That check was already used. Please do it again.',
}

export function ContactForm() {
  const [payload, setPayload] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  async function send(formElement: HTMLFormElement) {
    if (!payload) return
    const form = new FormData(formElement)
    setSending(true)
    setMessage(null)
    try {
      await rpc.invoke('submitContact', {
        name: form.get('name') as string,
        message: form.get('message') as string,
        altcha: payload,
      })
      setMessage({ ok: true, text: 'Thanks, we got your message.' })
      formElement.reset()
    } catch (error) {
      const code = String((error as Error).message).split(':')[0]
      setMessage({ ok: false, text: REFUSALS[code] ?? 'Something went wrong.' })
    } finally {
      // The payload is spent whether or not the submit worked.
      setResetKey((key) => key + 1)
      setSending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Keep the element: `currentTarget` is null once the handler has awaited.
    void send(event.currentTarget)
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4 p-6">
      <input
        name="name"
        required
        placeholder="Your name"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        name="message"
        required
        rows={4}
        placeholder="Your message"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <CaptchaField
        getChallenge={() => rpc.invoke('captcha:getChallenge')}
        onChange={setPayload}
        resetKey={resetKey}
      />
      <button
        type="submit"
        disabled={!payload || sending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Send'}
      </button>
      {message && (
        <p
          role="status"
          className={
            message.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'
          }
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
