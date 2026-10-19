import { defineScope } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * What may be done in an automation platform.
 *
 * The split that matters here is **editing a flow** versus **running one**.
 * They look similar and are not: a person who can run a flow can cause whatever
 * that flow does, and a person who can edit one can change what it does for
 * everybody. Plenty of operators should hold the first and not the second.
 *
 * No `admin` here — `@pikku/addon-console` declares that tree, and scopes
 * sharing a name must declare the same one.
 */
// @snippet start defineScopes
defineScope({
  flows: {
    displayName: 'Flows',
    description: 'The automations themselves',
    scopes: {
      read: { description: 'See flows and their definitions' },
      write: { description: 'Create and edit flows' },
      publish: { description: 'Activate a flow so it runs on its trigger' },
      run: { description: 'Start a flow by hand' },
    },
  },
  runs: {
    displayName: 'Runs',
    description: 'Executions and their step-by-step history',
    scopes: {
      read: { description: 'See runs and step output' },
      cancel: { description: 'Stop a run that is in flight' },
      replay: { description: 'Re-run a past execution with its original input' },
    },
  },
  connections: {
    displayName: 'Connections',
    description: 'Credentials the flows use to reach other systems',
    scopes: {
      read: { description: 'See which connections exist' },
      link: { description: 'Connect or disconnect a third-party account' },
    },
  },
})
// @snippet end defineScopes
