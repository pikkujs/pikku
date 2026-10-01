import { resolve } from 'node:path'

import { pikkuSessionlessFunc } from '#pikku/function'
import { LocalMetaService } from '@pikku/core/services/local-meta'
import {
  readScenarioCoverage,
  type ScenarioCoverage,
} from '@pikku/core/scenario/coverage'
import { dim } from '../../fabric/lib/output.js'

export const scenarioCoverage = pikkuSessionlessFunc<
  { routes?: string },
  ScenarioCoverage
>({
  func: async ({ config }, { routes }) =>
    readScenarioCoverage(
      new LocalMetaService(resolve(config.rootDir, config.outDir)),
      {
        routes: routes
          ?.split(',')
          .map((route) => route.trim())
          .filter(Boolean),
      }
    ),
})

const MAX_LISTED = 25

const listed = (items: string[]) => [
  ...items.slice(0, MAX_LISTED).map((item) => `  • ${item}`),
  ...(items.length > MAX_LISTED
    ? [dim(`  … ${items.length - MAX_LISTED} more`)]
    : []),
]

export const renderScenarioCoverage = (
  _services: unknown,
  { api, mutations, routes }: ScenarioCoverage
): void => {
  const lines: string[] = []

  lines.push(
    api
      ? `Functions  ${api.covered}/${api.total} fully reached by a scenario (${api.pct}%) ${dim(`— ${api.environment}, ${api.generatedAt}`)}`
      : `Functions  not measured ${dim('— run `pikku scenario run <env> --coverage` first')}`
  )
  if (api?.gaps.length) {
    lines.push(
      ...listed(
        api.gaps.map(
          (gap) =>
            `${gap.function} ${dim(`${gap.sourceFile} ${gap.missing.join(',')}`)}`
        )
      )
    )
  }

  lines.push(
    `Mutations  ${mutations.covered}/${mutations.required} driven by a scenario`
  )
  if (mutations.uncovered.length) {
    lines.push(
      ...listed(
        mutations.uncovered.map(
          ({ id, sourceFile }) =>
            `${id}${sourceFile ? ` ${dim(sourceFile)}` : ''}`
        )
      )
    )
  }

  lines.push(
    routes.total === null
      ? `Pages      ${routes.visited.length} opened by a scenario ${dim('— pass --routes to see the ones none opens')}`
      : `Pages      ${routes.total - routes.unvisited!.length}/${routes.total} opened by a scenario`
  )
  if (routes.unvisited?.length) lines.push(...listed(routes.unvisited))

  console.log(lines.join('\n'))
}
