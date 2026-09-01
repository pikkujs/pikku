# Pikku Workflows — Client Hooks


## Discover what workflows exist

```bash
yarn pikku meta clients --json | jq '.workflows'
```

Each entry has `name`, `description`, `mode` (inline | distributed), plus
`input` / `output` type names. Pass the workflow **name** to the hooks
below.

## Setup

These hooks are generated into the same `api.gen.ts` as `usePikkuQuery` —
no extra setup beyond `PikkuProvider` + `QueryClientProvider` (see the
`references/client.md` and `references/react-query.md`).

## `useRunWorkflow(name, options?)` — run and wait

For short, synchronous-feeling workflows. Returns a mutation that
resolves to the workflow's output.

```tsx
import { useRunWorkflow } from './pikku/api.gen'

function ChargeButton({ orderId }: { orderId: string }) {
  const run = useRunWorkflow('chargeOrder', {
    onSuccess: (output) => toast.success(`Charged: $${output.amount}`),
  })
  return (
    <button onClick={() => run.mutate({ orderId })} disabled={run.isPending}>
      {run.isPending ? 'Charging…' : 'Charge'}
    </button>
  )
}
```

Use this when the workflow finishes in seconds and the UI can hold open
a loading state until done.

## `useStartWorkflow(name, options?)` — fire-and-poll

Returns a mutation that resolves to `{ runId: string }` immediately. The
workflow keeps running on the server. Pair with `useWorkflowStatus` to
render progress.

```tsx
const start = useStartWorkflow('processVideo', {
  onSuccess: ({ runId }) => setActiveRunId(runId),
})

start.mutate({ videoId: '123' })
```

Use this for long-running workflows (uploads, batch jobs, AI generation,
anything you'd want a progress bar for).

## `useWorkflowStatus(workflowName, runId, options?)` — observe

Polls the workflow runtime for a run's status. Returns a typed status
object with `status`, optional `output`, and optional `error`.

```tsx
import { useWorkflowStatus } from './pikku/api.gen'

function VideoStatus({ runId }: { runId: string }) {
  const { data: status } = useWorkflowStatus('processVideo', runId, {
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 1000 : false,
  })

  if (!status) return null
  if (status.status === 'running') return <Spinner />
  if (status.status === 'completed') return <Result {...status.output} />
  if (status.status === 'failed')
    return <Error message={status.error?.message} />
  return null
}
```

Status values: `'running' | 'suspended' | 'completed' | 'failed' | 'cancelled'`.

**Stopping the poll is your job.** The hook adds no terminal-state logic of its
own — the `refetchInterval` callback above is what ends it, by returning `false`
once `status` is no longer `running`. Leave that out and a finished run keeps
being polled forever.

The hook is disabled until `runId` is set, so passing `undefined` while the run
has not started yet is the intended shape rather than something to guard around.
That `enabled` is owned by the hook and cannot be overridden through `options`.

## Putting it together — start + observe

```tsx
function ProcessVideoFlow({ videoId }: { videoId: string }) {
  const [runId, setRunId] = useState<string>()
  const start = useStartWorkflow('processVideo', {
    onSuccess: ({ runId }) => setRunId(runId),
  })
  const status = useWorkflowStatus('processVideo', runId)

  if (!runId) {
    return (
      <button
        onClick={() => start.mutate({ videoId })}
        disabled={start.isPending}
      >
        Start
      </button>
    )
  }
  return <ProgressBar status={status.data?.status} />
}
```

## Backend: streaming richer progress

The status hook returns a coarse-grained state machine (`running`,
`completed`, etc.). For step-by-step updates inside a long workflow,
publish events from the workflow itself via `eventHub` or open a
WebSocket channel — out of scope for this skill (see workflow + channel
docs).

## What NOT to do

- Don't poll status manually with `setInterval` — use `useWorkflowStatus`
  with a `refetchInterval` callback, which dedupes across components and
  lets you stop on a terminal state in one place.
- Don't call `useRunWorkflow` for workflows that take more than a few
  seconds. The user-facing component will hold a long-running pending
  state with no progress indication; use start + status instead.
- Don't use these hooks for non-workflow RPCs — they only resolve
  workflow-shaped names. Regular RPCs go through `usePikkuQuery` /
  `usePikkuMutation`.
