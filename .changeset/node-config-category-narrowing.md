---
'@pikku/cli': patch
'@pikku/addon-graph': patch
---

Make the generated `NodeConfig` narrowing reach the place people write `node:`

An addon declares its categories in `pikku.config.json`, and the CLI generates a
`NodeConfig` whose `category` narrows to that union. It never checked anything:
`pikkuFunc`'s config came straight from `CorePikkuFunctionConfig`, whose
`node?: CoreNodeConfig` types `category` as `string`. The narrowed type was
generated for two sibling barrels — the workflow and scenario configs import it
— and for nothing else, so the one position a user writes a `node:` block was
typed by core all along. `PikkuFunctionConfig`, `PikkuFunctionSessionlessConfig`
and both schema-overload variants now omit core's `node` and re-add it as
`NodeConfig`, so an undeclared category is a compile error rather than only a
codegen critical.

Second half of the same bug: the config key that carries those categories moved
from a top-level `node` block to `addon` when node was renamed to addon, and
eight config files in this repo were never migrated — every e2e addon,
`@pikku/addon-graph`, the `function-addon` template and the registry verifier.
`addon` accepts `boolean | object` and the stray `node` key was silently
ignored, so each of them shipped `"package": {}` in its generated addon
metadata: no displayName, no description, no icon, no categories, and
`pikkuNodesMeta`'s category validation never ran. They now sit under `addon`.

With that validation live for the first time, `@pikku/addon-graph`'s `readFile`
and `writeFile` turned out to declare a `Files` category the package never
listed. `Files` is now declared.
