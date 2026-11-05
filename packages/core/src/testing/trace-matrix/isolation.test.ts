import { describe, test } from 'node:test'
import { assertChain } from './assertions.js'
import { TraceChain, type ChainCombo } from './chain-harness.js'
import { STARTS } from './dimensions.js'

/** No AsyncLocalStorage: only the wire keeps two callers apart, so crowd it. */
const CONCURRENT = 25
const HOPS = ['rpc', 'mesh', 'enqueue', 'schedule', 'start-workflow'] as const

describe(`${CONCURRENT} chains started at once never share or swap a trace`, () => {
  for (const start of STARTS) {
    for (const hop of HOPS) {
      for (const timing of ['concurrent-starts', 'slow-overlap'] as const) {
        for (const outcome of ['success', 'throw-plain-error'] as const) {
          test(`${start} / ${hop} / ${timing} / ${outcome}`, async () => {
            const chain = new TraceChain({
              start,
              hop,
              timing,
              outcome,
              instances: CONCURRENT,
              ...(['http', 'queue-job', 'schedule', 'agent-tool'].includes(
                start
              )
                ? { inbound: 'valid' }
                : {}),
            } as ChainCombo)
            try {
              await chain.run()
              await assertChain(chain)
            } finally {
              chain.dispose()
            }
          })
        }
      }
    }
  }
})
