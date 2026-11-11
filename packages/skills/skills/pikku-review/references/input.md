# Input

Schemas are the contract, and a loose one moves the failure somewhere harder to find.

- Is a closed set a `z.enum`, in outputs as well as inputs, not `z.string()`?
- Is every string and number bounded? Is every list limited?

The verdict depends on what reaches the value. A free-text note with no maximum that goes to a paid model or a loop is `fix`. The same field stored and displayed, with a request size limit already in front of it, is `strict`.
- Does a date parse as a real date? `2026-13-99` should not pass a regex and fail three steps later.
- Does the schema describe the data exactly, or more loosely than it is?
- Is every value parsed from config or a list trimmed and normalised before an exact comparison, and does a sibling consumer normalise it differently?
