---
'@pikku/addon-typesafe': minor
---

Add `@pikku/addon-typesafe`: TypeSafe System One as an addon, so calibrated
judgments are available to any project as `ref('typesafe:...')` rather than as
a service each app wires itself.

`classifyTask` answers the two questions asked at the top of a piece of work —
whether it is worth planning, and whether to build it as a function, a
workflow or an agent — in one request. `ask` is the unopinionated door for
everything else.

The addon declares `TYPESAFE_API_KEY` with `allowedHosts: ['api.typesafe.ai']`
and reads it literally, so it is scoped to that one secret and needs no grants
from the consumer.
