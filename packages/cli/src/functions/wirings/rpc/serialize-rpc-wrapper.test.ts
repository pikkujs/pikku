import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'

const agentMember = (output: string, member: string) =>
  output.match(
    new RegExp(
      `\\n        ${member}: \\(\\([\\s\\S]*?\\n        \\}\\) as \\w+,`
    )
  )?.[0] ?? ''

describe('serializeRPCWrapper agent namespace', () => {
  const output = serializeRPCWrapper('./pikku-rpc-map.gen.js', '/api')

  test('stream reads the event stream instead of parsing the reply as JSON', () => {
    const stream = agentMember(output, 'stream')
    assert.match(
      stream,
      /this\.pikkuFetch\.agentStream\(`\/api\/rpc\/agent\/\$\{String\(agentName\)\}\/stream`, input, options\)/
    )
    assert.doesNotMatch(stream, /pikkuFetch\.post/)
    assert.match(stream, /\) as TypedAgentClientStream,$/)
  })

  test('stream is typed as an async iterable of AG-UI events', () => {
    assert.match(
      output,
      /import type \{ PikkuAgentEvent, PikkuAgentStreamOptions \} from '@pikku\/fetch'/
    )
    assert.match(
      output,
      /export type TypedAgentClientStream = <Name extends AgentName>\([\s\S]*?\) => AsyncGenerator<PikkuAgentEvent, void, undefined>/
    )
  })

  test('run and approve are typed per agent from the rpc map', () => {
    assert.match(
      output,
      /import type \{ RPCInvoke, AgentName, TypedAgentRun, TypedAgentApprove, [^}]*\} from '\.\/pikku-rpc-map\.gen\.js'/
    )
    assert.match(agentMember(output, 'run'), /\) as TypedAgentRun,$/)
    assert.match(
      agentMember(output, 'run'),
      /this\.pikkuFetch\.post\(`\/api\/rpc\/agent\/\$\{String\(agentName\)\}`/
    )
    assert.match(agentMember(output, 'approve'), /\) as TypedAgentApprove,$/)
    assert.match(
      agentMember(output, 'approve'),
      /this\.pikkuFetch\.post\(`\/api\/rpc\/agent\/\$\{String\(agentName\)\}\/approve`/
    )
  })

  test('no agent method is cast to any', () => {
    const agent = output.slice(
      output.indexOf('agent = {'),
      output.indexOf('subscribeToSSE<')
    )
    assert.doesNotMatch(agent, /as any/)
  })
})
