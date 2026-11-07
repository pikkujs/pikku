declare const pikkuWorkflowFunc: any
declare const pikkuWorkflowComplexFunc: any
declare const pikkuWorkflowGraph: any
declare const pikkuScenario: any
declare class WorkflowCancelledException { constructor(reason: string) }
const LIST = ['a', 'b']
const OBJ = { x: 1, y: 'two', z: [1, 2, null, true] }
const NUM = 0x10
export const wfA = pikkuWorkflowFunc({
  title: 'A', summary: 'sum', tags: ['t1'], expose: true, skip: 'no',
  func: async ({}: any, data: any, { workflow }: any) => {
    let count = 0
    let name = 'x'
    let flag = false
    let items = [1, 2]
    let cfg = { a: 1 }
    const r1 = await workflow.do('s1', 'rpcOne', { a: data.a, list: LIST, obj: OBJ, n: NUM, lit: 'z', arr: [data.q, 3], nested: { k: data.k }, tpl: `x${data.y}z${count}`, plain: `p` })
    const r2 = await workflow.do('s2', 'rpcTwo', r1, { retries: 2, retryDelay: '5s', description: 'hello', virtualUser: virtualUsers.bob })
    const active = data.users.filter((u: any) => u.active && !u.gone)
    const any1 = data.users.some((u: any) => u.ok)
    const all1 = data.users.every((u: any) => (u.ok || u.fine))
    switch (data.kind) {
      case 'a': await workflow.do('sa', 'rpcA', { v: r1.id }); break
      case 1: count = 1; break
      case data.other: await workflow.sleep('sl', 100); break
      default: await workflow.do('sd', 'rpcD', {})
    }
    if (data.x) { await workflow.suspend('wait here') } else if (data.y) { await workflow.milestone('m1') } else await workflow.sleep('z', '2m')
    const approval = await workflow.approval('ok?', { expiry: '1d', approvers: 'admin', approverScope: 'ops' })
    await Promise.all(data.items.map(async (it: any) => { const q = await workflow.do('each', 'rpcEach', { id: it.id, c: count }); await workflow.sleep('pause', 10) }))
    for (const u of data.users) { await workflow.do('seq', 'rpcSeq', { u }); if (u.ok) { await workflow.sleep('g', 7) } }
    name = 'y'
    flag = data.f
    count = data.cnt
    if (data.cancel) { throw new WorkflowCancelledException('stop') }
    return { r1, n: r2.name, count, name, lit: 5, d: data.zzz, tpl: `a`, ex: data.a + 1, ...r1 }
  },
})
export const wfB = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  const [a, b] = await Promise.all([workflow.do('a', 'ra', data), workflow.do('b', 'rb', data)])
  return a
})
export const wfC = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  for (const i of [1,2,3]) { await workflow.do('x', 'y', {}) }
  const {a, b} = await workflow.do('d', 'dd', {})
  if (data.x) { const inner = await workflow.do('i', 'ii', {}) }
  let a1 = 1, b1 = 2
  return { x: 1 }
})
export const wfD = pikkuWorkflowComplexFunc(async ({}: any, data: any, { workflow }: any) => {
  const r = await workflow.do('s', 'rr', {})
  workflow.cancel()
  await workflow.do('inl', async () => 5, { description: 'desc', retries: 1 })
  await workflow.do(`dyn${data.x}`, async () => 5)
  await workflow.sleep(`z${data.x}`, 0)
  await workflow.sleep('y', 'abc')
})
export const scn = pikkuScenario({
  name: 'scn', 
  func: async ({}: any, data: any, { scenario }: any) => {
    const g = await scenario.given('g1', 'giveFn', { a: 1 }, { virtualUser: virtualUsers['alice'] })
    await scenario.when('w1', 'whenFn', g)
    await scenario.then('t1', 'thenFn', {})
    await scenario.expectEventually('ee', 'eeFn', {}, {}, { virtualUser: virtualUsers.carol })
    await scenario.expectService('svc')
  },
})
export const g1 = pikkuWorkflowGraph({
  name: 'g-one', tags: ['a', 'b'], notes: ['n1'],
  nodes: { a: 'ra', b: 'rb', c: 'rc', 'd-e': 'rd' },
  config: {
    a: { next: { ok: 'b', no: ['c', 'd-e'] }, onError: 'c', mode: 'seq', retries: 3, retryDelay: '1s', notes: 'hi' },
    b: { next: 'c', input: (r: any, t: any, i: any) => { return { x: r('a', 'out'), y: i('p'), z: 5, w: [1, r('a'), -2.5], q: { k: 'v' }, s: t('$1-$0-$9', [r('a','x'), r('a','y')]) } } },
    c: { input: (r: any) => ({ 'quoted': r('b', 'p') }), forEach: (r: any) => { return r('a', 'items') }, retryDelay: 100 },
  },
})
export const wfE = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  const {a, b} = await workflow.do('d', 'dd', {})
})
export const wfF = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  if (data.x) { const inner = await workflow.do('i', 'ii', {}) }
})
export const wfG = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  for (const u of data.users) { if (u.a) { await workflow.do('i', 'ii', {}) } }
  for (const u of data.users) { console.log(u) }
  const x = await workflow.do('i', dyn, {})
  await workflow.do('k', 'kk', {}, { compensate: true })
  let a1 = 1, b1 = 2
  try { } catch (e) {}
})
export const wfH = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  const [q, w] = await Promise.all([workflow.do('a', 'ra', data)])
})
export const wfI = pikkuWorkflowFunc(async ({}: any, { workflow }: any) => {
  const z = await workflow.do('a', 'ra', {})
  return { a: z.k, b: workflow.x.y, c: 3 }
})
