//~ name: ui-workflow-gate
//~ title: Start a durable approval and poll it with the generated workflow hooks
//~ when: A screen kicks off something that waits for a person or an external system — a quote that needs sign-off, a refund above a threshold, an onboarding that pauses on a document. Use this when the wait is durable and measured in hours or days. A request that merely takes ten seconds is a mutation, not a workflow.
//~ entity: quote
//~ lang: tsx

//~ steps:
//~ `useStartWorkflow` and `useWorkflowStatus` are generated only when the project has at
//~ least one workflow, and they are typed from the workflow map rather than the RPC map.
//~ The run id is the whole handle: hold it, and the browser can close, the tab can reload,
//~ the server can redeploy, and the gate is still there when someone comes back for it.
//~ Which is why it belongs in a URL or a row, not only in React state.
// ===== FILE: src/components/quote-gate.tsx =====
import { useState } from 'react'
import { useStartWorkflow, useWorkflowStatus } from '../pikku/api.gen'

export const QuoteGate = ({ quoteId }: { quoteId: string }) => {
  const [runId, setRunId] = useState<string | undefined>()

  const start = useStartWorkflow('quoteApprovalWorkflow', {
    //~ The start call returns as soon as the run is durable, so what comes back
    //~ is a receipt, not an outcome. Everything after this point is the status
    //~ query's job.
    onSuccess: ({ runId }) => setRunId(runId),
  })

  //~ Disabled until there is a run id — the generated hook already guards on it,
  //~ so there is nothing to branch on here. Polling every few seconds is the
  //~ honest default for a gate a human answers.
  const status = useWorkflowStatus('quoteApprovalWorkflow', runId, {
    refetchInterval: 5_000,
  })

  if (!runId) {
    return (
      <button
        onClick={() => start.mutate({ quoteId })}
        disabled={start.isPending}
      >
        {start.isPending ? 'Sending…' : 'Send for approval'}
      </button>
    )
  }

  return (
    <section>
      <p>Approval run {runId}</p>
      {/*~ `suspended` is the state that makes this a workflow: the run is alive,
          waiting on a person, and costing nothing while it waits. */}
      {status.data?.status === 'suspended' ? (
        <p>Waiting on a dispatcher…</p>
      ) : null}
      {status.data?.status === 'completed' ? <p>Decided.</p> : null}
      {status.data?.status === 'failed' ? (
        <p role="alert">
          {status.data.error?.message ?? 'The approval failed'}
        </p>
      ) : null}
    </section>
  )
}
