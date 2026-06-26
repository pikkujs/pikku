---
'@pikku/cli': patch
---

fix(react-query): usePikkuInfiniteQuery feeds the page cursor back as `cursor`

The generated `usePikkuInfiniteQuery` injected the next-page cursor into the
request under the key `nextCursor`, but a list function built with
`pikkuListFunc` accepts the cursor as `cursor` (the `ListInput` field) and only
returns `nextCursor` on the output. So every page re-sent `cursor: undefined`
and the hook re-fetched page 1 forever. Feed `pageParam` back in as `cursor`
(and omit `cursor` from the caller's `data` arg) so it lines up with
`ListInput`/`ListOutput`. The output read in `getNextPageParam` is unchanged.
