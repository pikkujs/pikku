/**
 * Who the generated workflow routes turn away. Each scenario is a real request,
 * because the gates live in the routes and not in anything below them.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const HIDDEN = 'routeHiddenWorkflow'
const EXPOSED = 'routeExposedWorkflow'
const PUBLIC = 'routePublicWorkflow'
const OWNER = 'route-owner'
const input = { data: { value: 2 } }

export const anonymousStartRefused = pikkuScenario<void, { refused: true }>({
  title: 'An anonymous caller cannot use the session start route',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/start`,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const anonymousRunRefused = pikkuScenario<void, { refused: true }>({
  title: 'An anonymous caller cannot run a workflow',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/run`,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const anonymousStatusRefused = pikkuScenario<void, { refused: true }>({
  title: 'An anonymous caller cannot read a status',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/status/any-run`,
        method: 'GET',
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const anonymousApproveRefused = pikkuScenario<void, { refused: true }>({
  title: 'An anonymous caller cannot answer a gate',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/approve/any-run`,
        body: { reason: 'gate', decision: {} },
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const anonymousRouteNeedsOptIn = pikkuScenario<void, { refused: true }>({
  title: 'The anonymous route refuses a workflow without auth: false',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/start/anonymous`,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const anonymousRouteHidesNames = pikkuScenario<void, { refused: true }>({
  title: 'The anonymous route answers the same for an unknown name',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: '/workflow/noSuchWorkflow/start/anonymous',
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const hiddenStartRefused = pikkuScenario<void, { refused: true }>({
  title: 'A signed-in caller cannot start a hidden workflow',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${HIDDEN}/start`,
        userId: OWNER,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const hiddenRunRefused = pikkuScenario<void, { refused: true }>({
  title: 'A signed-in caller cannot run a hidden workflow',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${HIDDEN}/run`,
        userId: OWNER,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const approveRefusesUnknownRun = pikkuScenario<void, { refused: true }>({
  title: 'A signed-in caller cannot answer a run that is not there',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/approve/no-such-run`,
        userId: OWNER,
        body: { reason: 'gate', decision: {} },
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const ownerAloneReadsARun = pikkuScenario<void, { read: true }>({
  title: 'Only the user who started a run can read it',
  description: 'The owner reads it, another user gets a 403',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${EXPOSED}/start`,
      userId: OWNER,
      body: input,
    })
    const { runId } = JSON.parse(started.serialized)
    const path = `/workflow/${EXPOSED}/status/${runId}`
    const stranger = await scenario.when(
      'a stranger reads',
      'callsWorkflowRoute',
      {
        path,
        method: 'GET',
        userId: 'someone-else',
      }
    )
    await scenario.then('expects a refusal', 'expectsRouteStatus', {
      call: stranger,
      status: 403,
    })
    const owner = await scenario.when('the owner reads', 'callsWorkflowRoute', {
      path,
      method: 'GET',
      userId: OWNER,
    })
    await scenario.then('expects an answer', 'expectsRouteStatus', {
      call: owner,
      status: 200,
    })
    return { read: true }
  },
})

export const anonymousRunHasNoReader = pikkuScenario<void, { refused: true }>({
  title: 'An opted-in workflow starts anonymously, and nobody can read the run',
  description: 'A run with no owner is refused to every signed-in user',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${PUBLIC}/start/anonymous`,
      body: input,
    })
    await scenario.then('expects it to start', 'expectsRouteStatus', {
      call: started,
      status: 200,
    })
    const { runId } = JSON.parse(started.serialized)
    const read = await scenario.when('someone reads', 'callsWorkflowRoute', {
      path: `/workflow/${PUBLIC}/status/${runId}`,
      method: 'GET',
      userId: OWNER,
    })
    await scenario.then('expects a refusal', 'expectsRouteStatus', {
      call: read,
      status: 403,
    })
    return { refused: true }
  },
})

export const startValidatesInput = pikkuScenario<void, { refused: true }>({
  title: 'The start route validates input against the declared schema',
  description: 'A value of the wrong type never starts a run',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${EXPOSED}/start`,
      userId: OWNER,
      body: { data: { value: 'not a number' } },
    })
    await scenario.then('expects a refusal', 'expectsRouteStatus', {
      call: answer,
      status: 422,
    })
    return { refused: true }
  },
})

export const workflowRouteAccessFeature = pikkuFeature({
  name: 'Workflow route access',
  description: 'Who the generated workflow routes refuse',
  tags: ['workflow'],
  scenarios: [
    anonymousStartRefused,
    anonymousRunRefused,
    anonymousStatusRefused,
    anonymousApproveRefused,
    anonymousRouteNeedsOptIn,
    anonymousRouteHidesNames,
    hiddenStartRefused,
    hiddenRunRefused,
    approveRefusesUnknownRun,
    ownerAloneReadsARun,
    anonymousRunHasNoReader,
    startValidatesInput,
  ],
})
