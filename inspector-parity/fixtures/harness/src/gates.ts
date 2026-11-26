import {
  pikkuHarness,
  pikkuHarnessGate,
  pikkuHarnessGateAgent,
  type Finding,
} from './declare.js'

export const checkGate = pikkuHarnessGate({
  name: 'check',
  description: 'Runs codegen and the type-check',
  failOn: 'high',
  workflowRetries: 1,
  workflowTimeout: '5min',
  func: async ({ logger }: any): Promise<Finding[]> => {
    logger.info('check')
    return []
  },
})

export const formatGate = pikkuHarnessGate({
  name: 'format',
  description: 'Formats the changed files',
  failOn: 'medium',
  writes: ['**/*.{ts,tsx}'],
  func: async (): Promise<Finding[]> => [],
})

export const reviewer = pikkuHarnessGateAgent({
  name: 'review',
  description: 'Reads the diff for dead code',
  model: 'cheap',
  goal: 'The diff adds no unused code',
  failOn: 'high',
})

export const defaultGates = [checkGate, 'format'] as const

const onlyCheck = [checkGate]

export const buildHarness = pikkuHarness({
  name: 'build',
  description: 'Builds one changeset',
  agent: { model: 'default' },
  gates: [...defaultGates, reviewer.with({ failOn: 'medium' })],
})

export const quickHarness = pikkuHarness({
  name: 'quick',
  description: 'Only the type-check',
  agent: { model: 'cheap' },
  gates: onlyCheck,
})

export const lintGate = pikkuHarnessGate({
  name: 'lint',
  description: 'Lints the changed files and writes nothing',
  failOn: 'high',
  writes: [],
  func: async (): Promise<Finding[]> => [],
})

const noExtraGates = [] as const

export const repeatedSpreadHarness = pikkuHarness({
  name: 'repeatedSpread',
  description: 'Spreads one const array twice',
  agent: { model: 'cheap' },
  gates: [...noExtraGates, ...noExtraGates, 'lint'],
})
