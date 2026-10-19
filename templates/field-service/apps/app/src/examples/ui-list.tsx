//~ name: ui-list
//~ title: Read a list into a screen with the GENERATED usePikkuQuery hook
//~ when: A screen has to show rows the backend already returns from an exposed RPC. This is the default read path for every list, table and detail screen — reach for it before useEffect + fetch, before a hand-written client, and before anything that types the response by hand.
//~ entity: job
//~ lang: tsx

//~ steps:
//~ `usePikkuQuery` is NOT exported from @pikku/react. It is GENERATED per project by
//~ the CLI from your own RPC map, into the file named by `clientFiles.reactQueryFile`
//~ in pikku.config.json. If the import below does not resolve, that key is unset — set
//~ it and re-run `pikku all`. That is also why the name and the argument shape are
//~ type-checked: `'listJobs'` is a key of YOUR FlattenedRPCMap, and passing an input
//~ the function does not accept is a compile error, not a 400 at runtime.
// ===== FILE: src/components/job-list.tsx =====
import { usePikkuQuery } from '../pikku/api.gen'

//~ The row type comes OUT of the generated map — never write a parallel interface for
//~ it. A hand-written `type Job = { ... }` compiles happily while the backend schema
//~ moves on, and the drift only shows as undefined at runtime.
export const JobList = () => {
  //~ First argument: the RPC name. Second: its input, which is also the query key, so
  //~ changing a filter refetches with no extra wiring. Third (optional): react-query
  //~ options, minus queryKey/queryFn which the hook owns.
  const { data, isPending, error } = usePikkuQuery(
    'listJobs',
    { status: 'scheduled' },
    { staleTime: 10_000 }
  )

  //~ Three states, always. A screen that renders only the happy path shows an empty
  //~ box for both "still loading" and "the server said no", which is the bug report
  //~ that reads "it just doesn't work sometimes".
  if (isPending) return <p>Loading jobs…</p>
  if (error) return <p role="alert">Could not load jobs: {error.message}</p>

  return (
    <ul>
      {data.jobs.map((job) => (
        <li key={job.jobId}>
          <strong>{job.title}</strong> — {job.status}
          {job.technicianName ? ` · ${job.technicianName}` : ' · unassigned'}
        </li>
      ))}
    </ul>
  )
}
