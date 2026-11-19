import { NotFoundError } from '@pikku/core/errors'
import { OTLP_RUNS_TOPIC } from '@pikku/core/otlp/runs'
import { defineScope } from '@pikku/core/scope'
import { pikkuFunc, pikkuSubscribeFunc } from '#pikku/function'
import { pikkuMiddleware } from '#pikku/middleware'
import { defineHTTPRoutes, wireHTTPRoutes } from '../.pikku/http/index.js'
import { getOtlpRuns } from './functions/wirings/otlp/register-otlp-runs.js'

// The inspector checks a function's scopes against the scopes its own project
// declares, so the CLI declares the tree core owns (otlpRunsScopeDefinition);
// a project's generated scope list merges the two.
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

// The live runs of the process the CLI runs in. The routes are only served
// where a command started the feed (registerOtlpRuns): everywhere else the gate
// answers 404, so the handlers can assume the feed exists.
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

wireHTTPRoutes({ routes: { otlpRuns: otlpRunsRoutes } })
