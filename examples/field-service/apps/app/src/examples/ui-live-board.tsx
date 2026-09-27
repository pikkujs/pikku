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
//~ the single source of truth and costs one cheap refetch. Topics are plain strings unless
//~ you set `clientFiles.realtimeEventHubTopicsImport`, which makes subscribe/unsubscribe
//~ fully typed.
// ===== FILE: src/components/live-board.tsx =====
import { useEffect } from 'react'
import { usePikkuRealtime } from '@pikku/react'
import { useQueryClient } from '@tanstack/react-query'
import type { PikkuRealtime } from '#pikku/realtime.gen.js'
import { usePikkuQuery } from '../pikku/api.gen'

export const LiveBoard = ({ companyId }: { companyId: string }) => {
  const realtime = usePikkuRealtime<PikkuRealtime>()
  const queryClient = useQueryClient()
  const jobs = usePikkuQuery('listJobs', {})

  useEffect(() => {
    //~ `subscribe` returns its own unsubscribe, so the effect's cleanup is the
    //~ return value verbatim. Forgetting it leaks a handler per mount, which is
    //~ how a board ends up refetching six times per event.
    return realtime.subscribe(`board:${companyId}`, () => {
      queryClient.invalidateQueries({ queryKey: ['listJobs'] })
    })
  }, [realtime, queryClient, companyId])

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
