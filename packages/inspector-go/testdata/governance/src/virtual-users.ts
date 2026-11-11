import { defineVirtualUsers } from '@pikku/core/virtual-user'

export const users = defineVirtualUsers({
  alice: {
    name: 'Alice',
    roles: ['admin'],
    goals: ['ship it'],
    tags: ['vip', `tmpl`],
    jobTitle: 'CEO',
    description: 'Boss',
    avatarUrl: 'https://x/y.png',
    personality: 'brisk',
    app: 'web',
    disposition: 'careless',
    tuning: {
      moves: { continue: 3, suspend: 0.5, resume: 1e21, abandon: 0 },
      temperature: 1.5,
      repeatRate: 0.25,
      emptyMemory: true,
      readOnly: false,
      instructions: 'Be quick',
    },
    fixtures: ['seed'],
    environments: ['local', 'staging'],
    account: { provider: 'google' },
    linkedAccounts: { github: { provider: 'github' }, mail: {}, bad: 'x' },
  },
  bob: { name: 'Bob', roles: ['viewer', someRole], runnable: false },
  carol: { name: 'Carol', account: {}, tuning: {} },
  noName: { roles: [] },
  badDisposition: { name: 'Dee', disposition: 'grumpy' },
  badTuning: {
    name: 'Eve',
    tuning: { moves: { continue: -1 }, temperature: 3, reReadRate: -0.5 },
  },
  notObj: 'x',
})

declare const someRole: string

export const again = defineVirtualUsers({ yan: { name: 'Yan' } })
