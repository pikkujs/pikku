import {
  pikkuHarness,
  pikkuHarnessGate,
  pikkuHarnessGateAgent,
  type Finding,
} from './declare.js'

const makeGates = () => ['check']
const paths = ['src/**']

export const typoHarness = pikkuHarness({
  name: 'typo',
  description: 'Lists a gate nobody declares',
  agent: { model: 'default' },
  gates: ['check', 'chek'],
})

export const computedHarness = pikkuHarness({
  name: 'computed',
  description: 'Builds its gate list at run time',
  agent: { model: 'default' },
  gates: makeGates(),
})

export const callEntryHarness = pikkuHarness({
  name: 'callEntry',
  description: 'Lists a gate by calling something',
  agent: { model: 'default' },
  gates: ['check', makeGates()[0]],
})

export const noModelHarness = pikkuHarness({
  name: 'noModel',
  description: 'Has no builder model',
  gates: ['check'],
})

export const bodilessGate = pikkuHarnessGate({
  name: 'bodiless',
  description: 'Declares no func',
  failOn: 'high',
})

export const looseGate = pikkuHarnessGate({
  name: 'loose',
  description: 'Has a severity that does not exist',
  failOn: 'severe',
  func: async (): Promise<Finding[]> => [],
})

export const computedWritesGate = pikkuHarnessGate({
  name: 'computedWrites',
  description: 'Declares writes from a variable',
  failOn: 'low',
  writes: paths,
  func: async (): Promise<Finding[]> => [],
})

export const goallessAgent = pikkuHarnessGateAgent({
  name: 'goalless',
  description: 'Has no goal',
  model: 'cheap',
  failOn: 'high',
})

export const clashingAgent = pikkuHarnessGateAgent({
  name: 'check',
  description: 'Has the name of a gate',
  model: 'cheap',
  goal: 'Anything',
  failOn: 'low',
})

const selfSpread: string[] = [...selfSpread]

export const selfSpreadHarness = pikkuHarness({
  name: 'selfSpread',
  description: 'Spreads a gate list into itself',
  agent: { model: 'default' },
  gates: selfSpread,
})
