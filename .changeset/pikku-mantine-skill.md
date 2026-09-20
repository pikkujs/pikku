---
'@pikku/skills': patch
---

Add a `pikku-mantine` skill covering the three Mantine-on-Pikku rules that were only written down downstream: formatting dates the generated clients hand back, flow-relative spacing for RTL locales, and colour-scheme branching without hardcoded shades.

The date rule is the one that earns the skill. `transformDates` revives fully-zoned ISO-8601 instants into `Date` objects and leaves every other date-shaped string alone, so a column's runtime type follows the value rather than the schema. Both ways of getting that wrong compile: a string method on a revived `Date` throws, and a raw `Date` in JSX throws `Objects are not valid as a React child` and drops the route into its error boundary. It is the most common white screen in a generated frontend and nothing in the type system catches it.
