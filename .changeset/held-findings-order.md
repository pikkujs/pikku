---
'@pikku/cli': patch
---

fix(fabric): held findings filed in the same millisecond are sent in the order they were held

`readHeld` sorts oldest first by `reportedAt`, which is only millisecond-precise,
and broke ties on a file name whose only other part was random. Two findings
filed back to back could come back in either order. The file name now carries
a monotonic sequence ahead of the random suffix.
