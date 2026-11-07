import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeAgentTypes } from './serialize-agent-types.js'

describe('serializeAgentTypes', () => {
  test('the agent leaf carries the types an app names', () => {
    const out = serializeAgentTypes('f', 'm', 'a', 'map', 's', 'sc')
    assert.match(
      out,
      /export type \{ AgentInput, AgentStreamEvent \} from '@pikku\/core\/agent'/
    )
  })
})
