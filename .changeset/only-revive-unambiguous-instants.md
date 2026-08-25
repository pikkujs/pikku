---
'@pikku/fetch': patch
---

Only revive a response string as a `Date` when it is an unambiguous ISO-8601 instant — a date, a time, and an explicit zone (`Z` or `±HH:MM`), with fractional seconds optional.

The previous pattern was unanchored and its time portion optional, so any string merely _beginning_ `YYYY-MM-DD` was replaced. An id like `2026-03-14-invoice-7` or a log line starting with a timestamp became an `Invalid Date`, which then threw wherever the app treated it as the `string` the generated client had typed it as. A field the server declares `z.string()` and sends as `2026-03-14` arrived as a `Date` while the SDK still said `string`, so the transport contradicted the types TypeScript was checking against.

Requiring the zone closes the other half of it. `2026-03-14` and `2026-03-14T08:12:00` name a day or a wall-clock reading, not a moment, and `new Date` resolves the first as UTC midnight and the second in whatever timezone the client sits in — the same payload decoding to different instants on different machines, with nothing in the types to say so. Both now stay strings, exactly as sent. A string whose shape is right but whose value is not a real time (`2026-02-31T00:00:00Z`) is left alone too, rather than becoming an `Invalid Date`.

**Behaviour change:** code that relied on a bare `YYYY-MM-DD` or a zoneless date-time being revived now receives the string. Either send a zone from the server, or parse the string where you need a `Date`. Instants that already carried a zone are unaffected.
