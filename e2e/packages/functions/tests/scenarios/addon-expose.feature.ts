/**
 * `wireAddon`'s `expose` decides what `POST /rpc/<name>:<fn>` reaches for an
 * addon instance. The todos addon never declared `getTodo` exposed, and the
 * app's list names it; `deleteTodo` is in neither, so it stays a 404.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

export const addonExposeListOpensScenario = pikkuScenario<
  void,
  { reached: true }
>({
  title: 'An addon function the wiring lists is reachable over RPC',
  description:
    'getTodo was never declared exposed by the addon; the expose list opens it',
  tags: ['scenario', 'addon-expose'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'resets the todos to their seed',
      'invokesRpcRaw',
      { rpcName: 'todos:resetTodos', data: {} },
      { actor: actors.guest }
    )
    const call = await scenario.when(
      'reads the first todo',
      'invokesRpcRaw',
      { rpcName: 'todos:getTodo', data: { id: '1' } },
      { actor: actors.guest }
    )
    await scenario.then(
      'gets the todo back',
      'expectsRpcResponse',
      { call, status: 200, contains: ['"id":"1"'] },
      { actor: actors.guest }
    )
    return { reached: true }
  },
})

export const addonExposeListClosesScenario = pikkuScenario<
  void,
  { status: 404 }
>({
  title: 'An addon function the wiring does not list is not found over RPC',
  description: 'deleteTodo is neither declared nor listed, so /rpc answers 404',
  tags: ['scenario', 'addon-expose'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'tries to delete a todo',
      'invokesRpcRaw',
      { rpcName: 'todos:deleteTodo', data: { id: '1' } },
      { actor: actors.guest }
    )
    await scenario.then(
      'is told there is no such function',
      'expectsRpcResponse',
      { call, status: 404 },
      { actor: actors.guest }
    )
    return { status: 404 }
  },
})

export const addonExposeFeature = pikkuFeature({
  name: 'Addon RPC exposure',
  description:
    "wireAddon's expose list decides which addon functions POST /rpc reaches",
  tags: ['addon-expose'],
  scenarios: [addonExposeListOpensScenario, addonExposeListClosesScenario],
})
