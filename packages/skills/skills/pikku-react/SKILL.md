---
name: pikku-react
description: >-
  Use when a React frontend talks to a Pikku backend — PikkuProvider and createPikku at the app
  root, the generated React Query hooks (usePikkuQuery, usePikkuMutation, usePikkuInfiniteQuery),
  direct usePikkuRPC / usePikkuFetch calls, realtime subscriptions, agent and workflow hooks, and
  the dev actor switcher. TRIGGER when: writing a React component that fetches or mutates backend
  data, wiring PikkuProvider, paginating, running or tracking a workflow from the client, or
  asking about useDevActors / VITE_DEV_ACTORS / quick login. DO NOT TRIGGER when: working on the
  backend (use pikku-wiring), defining the workflow itself (use pikku-workflow), or writing
  user-facing copy (use pikku-i18n).
installGroups: [client]
---

# Pikku React

The hook names and their argument types come from your generated `api.gen.ts` —
read it for what this app actually exposes. This skill is the part it cannot
tell you: which hook a given need calls for, and where the generated client
stops.

## Pick the reference

| You are… | Read |
| --- | --- |
| Wiring the app root, resolving the server URL, authenticating, or subscribing to realtime | `references/client.md` |
| Fetching, mutating or paginating data | `references/react-query.md` |
| Starting a workflow and showing its progress | `references/workflows.md` |

## Reach for what

| Need | Use |
| --- | --- |
| Render data, dedupe and cache | `usePikkuQuery` |
| Trigger a write and wait for the result | `usePikkuMutation` |
| Paginate | `usePikkuInfiniteQuery` |
| One-off call from an event handler | `usePikkuRPC()` |
| Hit a REST endpoint rather than an RPC | `usePikkuFetch()` |
| Talk to one named AI agent | `usePikkuAgent(name)` → `.run` / `.stream` / `.approve` |
| Run one named workflow | `usePikkuWorkflow(name)` → `.start` / `.run` / `.status` |
| A workflow long enough to need progress UI | `references/workflows.md` |
| Subscribe to events, SSE or a channel | `usePikkuRealtime()` |

A workflow that finishes in a moment can be awaited; one that does not needs
start-plus-observe, or the component holds a pending state with nothing to show.

## What NOT to do

- **Do not write a client.** The generated one covers every exposed function
  with full types; a hand-rolled RPC client or a hand-written
  `useQuery({ queryKey, queryFn })` reimplements it worse.
- **Do not instantiate `PikkuFetch`/`PikkuRPC` in a component.** `createPikku`
  runs once at the app root and the instance flows through context — and
  `usePikkuRPC()` outside `<PikkuProvider>` throws.
- **Do not call the RPC client inside a `useEffect`.** The hooks handle
  deduplication, caching and unmounting; a manual effect handles none of them.
- **Do not construct a hook name at runtime.** Hook names are the RPC names known
  at generation time, and a computed one is not type-checked.
- **Do not poll a workflow with `setInterval`.** `useWorkflowStatus` with a
  `refetchInterval` callback dedupes across components and stops on a terminal
  state in one place.
- **Do not reach for `as any` when a hook's types disagree with you.** The
  mismatch is the backend's input/output schema; fix it there.
- **Do not hardcode a user-facing string.** Every display string goes through an
  i18n message — see `pikku-i18n`.
