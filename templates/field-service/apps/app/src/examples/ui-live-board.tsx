//~ name: ui-live-board
//~ title: Let the server push, and refresh the query instead of duplicating its state
//~ when: A screen several people watch at once — a dispatch board, an order queue, a live status wall. Use it when a stale screen causes a wrong decision. A dashboard nobody stares at is better served by a refetch interval, which costs nothing to maintain.
//~ entity: job
//~ requires: ui-list
//~ lang: tsx

//~ steps:
//~ The event invalidates; it does not carry the row. That is the whole trick. A push that
//~ patches the cache directly needs the payload to match the query's shape forever, and it
//~ drifts the first time the backend adds a field — whereas invalidating makes the server
//~ the single source of truth and costs one cheap refetch. The client names no topic: the
//~ route is a pikkuSubscribeFunc, and the server derives the board from the session.
// ===== FILE: src/components/live-board.tsx =====
import { useEffect } from 'react'
import { usePikkuRealtime } from '@pikku/react'
import { useQueryClient } from '@tanstack/react-query'
import type { PikkuRealtime } from '@sdk/api/pikku-realtime.gen.js'
import { usePikkuQuery } from '@sdk/api/pikku-react-query.gen'

export const LiveBoard = () => {
  const realtime = usePikkuRealtime<PikkuRealtime>()
  const queryClient = useQueryClient()
  const jobs = usePikkuQuery('listJobs', {})

  useEffect(() => {
    //~ `subscribeToSSE` returns a handle, so the effect's cleanup closes it.
    //~ Forgetting that leaks a stream per mount, which is how a board ends up
    //~ refetching six times per event.
    const stream = realtime.subscribeToSSE('/board/events', () => {
      // Not awaited: the handler is synchronous. A failed refetch surfaces
      // through the query's own error state, so nothing is lost.
      void queryClient.invalidateQueries({ queryKey: ['listJobs'] })
    })
    return () => stream.close()
  }, [realtime, queryClient])

  return (
    <ul>
      {jobs.data?.jobs.map((job) => (
        <li key={job.jobId}>
          {job.title} — {job.status}
        </li>
      ))}
    </ul>
  )
}
