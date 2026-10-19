//~ name: ui-typed-form
//~ title: Type a form from the generated input type and let the server own validation
//~ when: Any form that writes through an RPC. Reach for it instead of hand-writing an interface for the form's fields, and instead of mirroring the backend's validation rules in the browser where they will drift the first time someone changes a schema.
//~ entity: job
//~ requires: ui-mutation
//~ lang: tsx

//~ steps:
//~ The input type comes out of the generated RPC map, which is built from the function's
//~ own zod schema. So the schema IS the form's type: add a required field on the backend
//~ and this file stops compiling, which is the moment you want to hear about it. Client
//~ validation is then a convenience for the shape of the control — `required`, a number
//~ input, a select — not a second copy of the rules. The authoritative refusal comes back
//~ on `mutation.error` and renders next to the field.
// ===== FILE: src/components/quote-form.tsx =====
import { useState } from 'react'
import type { DraftQuoteInput } from '#pikku/rpc/pikku-rpc-wirings-map.gen.d.js'
import { usePikkuMutation } from '../pikku/api.gen'

export const QuoteForm = ({ jobId }: { jobId: string }) => {
  //~ One piece of state for the whole payload, typed by the wire contract. A
  //~ per-field `useState` drifts from the schema silently; this cannot.
  const [draft, setDraft] = useState<DraftQuoteInput>({
    jobId,
    amountCents: 0,
    summary: '',
  })

  const draftQuote = usePikkuMutation('draftQuote')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        draftQuote.mutate(draft)
      }}
    >
      <label>
        Summary
        <input
          value={draft.summary}
          onChange={(event) =>
            setDraft({ ...draft, summary: event.target.value })
          }
        />
      </label>
      <label>
        Amount
        <input
          type="number"
          //~ Money in the smallest unit, because that is what the schema says.
          //~ Converting at the edge of the form keeps every layer below it in
          //~ integers.
          value={draft.amountCents / 100}
          onChange={(event) =>
            setDraft({
              ...draft,
              amountCents: Math.round(Number(event.target.value) * 100),
            })
          }
        />
      </label>
      <button type="submit" disabled={draftQuote.isPending}>
        {draftQuote.isPending ? 'Saving…' : 'Draft quote'}
      </button>
      {draftQuote.error ? <p role="alert">{draftQuote.error.message}</p> : null}
      {draftQuote.data?.needsApproval ? (
        <p>Over the threshold — a dispatcher has to sign this off.</p>
      ) : null}
    </form>
  )
}
