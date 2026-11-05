import { describe, test } from 'node:test'
import { chainMatrix, exclusionOf, pairwiseMatrix } from './dimensions.js'
import { TraceChain, type ChainCombo } from './chain-harness.js'
import { assertChain } from './assertions.js'
import { expectedFailure } from './expected-failures.js'

const name = (combo: Record<string, string>) => Object.values(combo).join(' / ')

const generate = (combo: ChainCombo, label: string) => {
  test(label, { todo: expectedFailure(label) }, async () => {
    const chain = new TraceChain(combo)
    try {
      await chain.run()
      await assertChain(chain)
    } finally {
      chain.dispose()
    }
  })
}

// A combo with a trusted inbound trace where the start has a carrier for one.
const carried = (combo: Record<string, string>) =>
  exclusionOf({ ...combo, inbound: 'valid' }) ? 'none' : 'valid'

describe('start × hop × outcome', () => {
  for (const combo of chainMatrix().combos) {
    generate({ ...combo, inbound: carried(combo) } as ChainCombo, name(combo))
  }
})

describe('pairwise across every dimension', () => {
  for (const combo of pairwiseMatrix().combos) {
    const { workflow, step, ...rest } = combo
    generate(
      {
        ...rest,
        ...(workflow !== 'none' ? { workflow } : {}),
        ...(step !== 'none' ? { step } : {}),
      } as ChainCombo,
      name(combo)
    )
  }
})
