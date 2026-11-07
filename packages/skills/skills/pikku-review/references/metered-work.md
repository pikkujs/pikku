# Metered work

Anything billed per use, such as model calls, can be correct on every normal path and still give free or unlimited use.

- Is spend recorded on cancel and failure, or only on normal completion?
- Is a limit checked only at entry, or again on each paid step of a long session?
- Who is billed, as stored? The recorded owner can silently differ from the owner passed in.
- Does a paid call happen before its spend is recorded, so a crash gives it away?
