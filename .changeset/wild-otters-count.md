---
'@pikku/skills': patch
---

Teach `pikku-kysely` to count round trips.

The skill documented the query builder API but said nothing about how many times
a function body crosses the wire, so generated functions routinely awaited four
or five queries in series — invisible locally, a stacked latency in a deployed
stage. Adds the four shapes that collapse: independent reads into `Promise.all`,
parent-then-children into the `jsonArrayFrom` helpers already documented below
it, read-then-write into one `returning()`/`onConflict` statement that also
closes the race, and a read that only feeds the next `where` into a subquery or
CTE. Plus the correction that a transaction adds round trips rather than
removing them.
