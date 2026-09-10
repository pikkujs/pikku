---
'@pikku/core': patch
---

A route declaring a numeric parameter could not be called over a query string. `coerceTopLevelDataFromSchema` converted an `array` from a comma-separated string and a `date-time` from text, but left numbers alone — and because the JSON Schema check runs before zod, `?year=2027` was rejected as `Instance type "string" is invalid. Expected "integer"` before the function ever ran. `z.coerce.number()` does not help: it runs after the schema has already refused. The shipped validator is spec-compliant and has no `coerceTypes` of its own, and `minimum`/`maximum` cannot stand in for one, being value constraints that apply only to instances that are already numbers.

`integer` and `number` now coerce from a string, on the same path as the two existing cases — so query strings, path params and argv reach a numeric parameter.

A string converts only when the number it produces prints back as the identical text. That rules out the readings that quietly rewrite the input — `007`, `+5`, `1e3`, `2027.50`, a padded ` 12 ` — and the values `Number` invents from nothing, where `''` and `'  '` both become `0`. It also rules out `9007199254740993`, which does not survive a double: a caller who sends an id as a string is usually doing so precisely because it does not, and rounding it silently would be data corruption. `NaN` and `Infinity` are refused for the same reason, and a fraction is refused where `integer` was asked for. Everything refused is left exactly as it arrived, so the validator reports the value the caller actually sent.

Note that this applies wherever the existing coercions already applied, which includes a JSON body — a string `"2027"` for a numeric field is now accepted there too, consistently with how an array and a `date-time` have always been read. A union `type` such as `['integer', 'null']` is left alone, as the array and `date-time` cases already leave it.
