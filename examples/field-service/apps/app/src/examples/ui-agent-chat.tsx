//~ name: ui-agent-chat
//~ title: Talk to a declared agent from a screen with usePikkuAgent
//~ when: A screen needs a conversation rather than a form — asking about the data in plain language, or letting someone describe what they want done. Only reach for this once an agent is declared on the backend with the tools it is allowed to use; an agent with no tools is a chatbot that cannot help.
//~ entity: job
//~ lang: tsx

//~ steps:
//~ `usePikkuAgent` comes from `@pikku/react` itself, not from the generated file — it is
//~ transport, and the agent's name is the only thing that varies. The `threadId` is what
//~ makes a conversation a conversation: reuse it and the agent remembers, generate a fresh
//~ one and it starts over. Keep it with whatever the conversation is ABOUT, so reopening
//~ the job reopens the thread.
// ===== FILE: src/components/dispatch-chat.tsx =====
import { useState } from 'react'
import { usePikkuAgent } from '@pikku/react'

export const DispatchChat = ({ threadId }: { threadId: string }) => {
  const agent = usePikkuAgent('dispatch-assistant')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const ask = async () => {
    setPending(true)
    setError(null)
    try {
      const outcome = await agent.run({
        message,
        threadId,
        //~ Who is asking. The agent runs with the caller's own session, so the
        //~ tools it calls are gated exactly as they are for a human — an agent
        //~ is not a way around a permission.
        resourceId: threadId,
      })
      //~ The reply is on `result`, not on a `text` field. An empty transcript
      //~ with a populated `result` is the normal shape, not a failure.
      setReply(String(outcome.result ?? ''))
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    } finally {
      setPending(false)
    }
  }

  return (
    <section>
      <input
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Who is free this afternoon?"
      />
      <button onClick={ask} disabled={pending || message.length === 0}>
        {pending ? 'Thinking…' : 'Ask'}
      </button>
      {reply ? <p>{reply}</p> : null}
      {error ? <p role="alert">{error.message}</p> : null}
    </section>
  )
}
