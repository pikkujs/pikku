//~ name: ui-mutation
//~ title: Write with usePikkuMutation, then invalidate the list so the screen catches up
//~ when: A form or a button changes something on the server and a list elsewhere on the page has to reflect it. This is the second half of every CRUD screen — pair it with list-query. Use it instead of refetching by hand, re-navigating, or reloading the page after a save.
//~ entity: job
//~ requires: ui-list
//~ lang: tsx

//~ steps:
//~ The invalidation key is the FIRST argument of the query you want to refresh — the
//~ generated `usePikkuQuery` keys on `[name, input]`, so `['listJobs']` matches every
//~ variation of that query regardless of its filters. Passing the input too narrows it
//~ to one filter and leaves the others stale, which is the bug where the row appears on
//~ one tab and not the next.
// ===== FILE: src/components/raise-job-form.tsx =====
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePikkuMutation, usePikkuQuery } from '../pikku/api.gen'

export const RaiseJobForm = () => {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [customerId, setCustomerId] = useState('')

  //~ `null`, not `{}`. An RPC that takes no input is typed `null` in the
  //~ generated map, and that is the argument the hook wants.
  const customers = usePikkuQuery('listCustomers', null)

  //~ One argument: the RPC name. The input type of `mutate` comes from the same
  //~ generated map, so the object below is checked against the function's zod schema
  //~ at compile time.
  const raise = usePikkuMutation('raiseJob', {
    //~ onSuccess is where the cache catches up. Doing it here rather than in the submit
    //~ handler means it also runs for a retry, and never runs for a failed write.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listJobs'] })
      setTitle('')
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        //~ Fire and forget: the mutation object below carries the pending and error
        //~ state, so there is nothing to await and nothing to catch here.
        raise.mutate({ customerId, title })
      }}
    >
      <label>
        Site
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">Choose a site…</option>
          {customers.data?.customers.map((customer) => (
            <option key={customer.customerId} value={customer.customerId}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        What is wrong
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {/*~ `isPending` disables the button, so a double click cannot raise two jobs. */}
      <button type="submit" disabled={raise.isPending || !customerId || !title}>
        {raise.isPending ? 'Raising…' : 'Raise job'}
      </button>
      {/*~ The error renders next to the control that caused it. A mutation whose error
          is never read is a save that silently did nothing. */}
      {raise.error ? <p role="alert">{raise.error.message}</p> : null}
    </form>
  )
}
