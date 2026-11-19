/**
 * The live runs of this process: the scope that guards them, the two functions
 * and the two routes.
 *
 * Generated into the project rather than shipped in the CLI or core: the scope
 * is declared by the project's own `defineScope`, so a project that leaves
 * `scaffold.otlpRuns` off has no scope and no routes, and the CLI itself needs
 * no scope store.
 *
 * The routes answer 404 until a command has started the feed in this process
 * (`registerOtlpRuns`), so the handlers can assume it exists. The holder is read
 * through `@pikku/cli/otlp-runs`, which is the module the commands set it on.
 */
export const serializeOtlpRunsScaffold = (
  leaf: (name: string) => string,
  globalHTTPPrefix: string = ''
): string => `/**
 * Auto-generated live runs routes
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { NotFoundError } from '@pikku/core/errors'
import { OTLP_RUNS_TOPIC } from '@pikku/core/otlp/runs'
import { getOtlpRuns } from '@pikku/cli/otlp-runs'
import { pikkuFunc, pikkuSubscribeFunc } from '${leaf('function')}'
import { pikkuMiddleware } from '${leaf('middleware')}'
import { defineHTTPRoutes, wireHTTPRoutes } from '${leaf('http')}'
import { defineScope } from '${leaf('scopes')}'

defineScope({
  pikku: {
    displayName: 'Pikku',
    description: 'What the Pikku runtime itself offers',
    scopes: {
      otlp: {
        displayName: 'Telemetry',
        description: 'Watching what this backend is doing, live',
        scopes: {
          runs: {
            description:
              'Read the live runs of this backend: the snapshot and the stream',
          },
        },
      },
    },
  },
})

// Where no command started the feed the gate answers 404, so the handlers can
// assume it exists.
const otlpRunsLiveGate = pikkuMiddleware(async (_services, _wire, next) => {
  if (!getOtlpRuns()) throw new NotFoundError()
  return next()
})

export const pikkuOtlpRunsSnapshot = pikkuFunc({
  title: 'Live Runs Snapshot',
  description:
    'The open runs, the recent closed ones and the health window of this process, with the seq they reflect.',
  scopes: ['pikku:otlp:runs'],
  tags: ['pikku'],
  func: async () => getOtlpRuns()!.snapshot(),
})

export const pikkuOtlpRunsSubscribe = pikkuSubscribeFunc<void, 'otlp.runs'>({
  title: 'Live Runs Stream',
  description: 'Subscribes the stream to the live run events of this process.',
  scopes: ['pikku:otlp:runs'],
  tags: ['pikku'],
  func: async () => OTLP_RUNS_TOPIC,
})

export const otlpRunsRoutes = defineHTTPRoutes({
  auth: true,
  tags: ['pikku'],
  middleware: [otlpRunsLiveGate],
  routes: {
    snapshot: {
      route: '/otlp/runs/snapshot',
      method: 'get',
      func: pikkuOtlpRunsSnapshot,
    },
    stream: {
      route: '/otlp/runs/stream',
      method: 'get',
      sse: true,
      func: pikkuOtlpRunsSubscribe,
    },
  },
})

wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { otlpRuns: otlpRunsRoutes } })
`
