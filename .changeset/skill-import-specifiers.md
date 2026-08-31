---
'@pikku/skills': patch
---

Fix the `#pikku` import specifiers the skills teach.

Twenty-five examples across ten skills named a leaf that does not export the
symbol — `pikkuAuth`/`pikkuPermission`/`addGlobalPermission` from `#pikku/function`
(they are in `#pikku/auth`), `addHTTPMiddleware` from `#pikku/http` (`#pikku/middleware`),
`pikkuServices`/`pikkuWireServices` from `#pikku/function` (`#pikku/setup`),
`pikkuWorkflowFunc` from `#pikku/function` (`#pikku/workflow`), `pikkuScenario` and
friends from `#pikku/scenario` and from `#pikku/workflow/pikku-workflow-types.gen.js`
(`#pikku/scenarios`), and `defineSystemRole` from a bare `#pikku` (`#pikku/scopes`).

`pikku-addon` also claimed an addon authors against `#pikku/addon/function` and
`#pikku/addon/setup`. It does not: `pikku new addon` writes an `imports` map that
points `#pikku/*` at the addon's own `.pikku/addon/` tree, so an addon uses the
same subpaths an application does. The `addon` segment is the package's business,
never part of a specifier.

An agent following these wrote a file that took schema generation red —
`Package import specifier "#pikku" is not defined in package .../packages/functions/package.json`
— which is a failure the example, not the agent, was responsible for.
