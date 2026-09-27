//~ name: ui-infinite-list
//~ title: Page through a long list with the generated usePikkuInfiniteQuery
//~ when: A list is long enough that one request is the wrong shape — a job history, an audit trail, a feed. Only reach for this once the backend RPC actually returns a cursor; a screen that loads everything and slices it in the browser is a different bug.
//~ entity: job
//~ lang: tsx

//~ steps:
//~ `usePikkuInfiniteQuery` is generated ONLY for RPCs whose output schema carries a
//~ `nextCursor` field. If the import below does not resolve, the backend function is
//~ the thing to change: give its output `nextCursor: z.string().nullable()`, return the
//~ cursor of the last row, and accept a `cursor` input. Nothing on the frontend can
//~ conjure the hook into existence.
// ===== FILE: src/components/job-history.tsx =====
import { usePikkuInfiniteQuery } from '../pikku/api.gen'

export const JobHistory = () => {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    usePikkuInfiniteQuery('listJobs', { limit: 20 })

  if (isPending) return <p>Loading…</p>

  return (
    <>
      <ul>
        {/*~ `data.pages` is one entry per request. Flattening here rather than in the
            backend keeps each page independently cacheable. */}
        {data?.pages.flatMap((page) =>
          page.jobs.map((job) => (
            <li key={job.jobId}>
              {job.title} — {job.status}
            </li>
          ))
        )}
      </ul>
      {hasNextPage ? (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </>
  )
}
