import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { planDev, startDevBackends } from './dev-backends.js'
import { SERVER_READY_MARKER } from '../../server/server-ready.js'

const two = {
  backends: { web: { dev: { port: 4101 } }, admin: { dev: { port: 4102 } } },
}

describe('planDev', () => {
  test('one declared backend runs inline on the shared tree', () => {
    const plan = planDev({ backends: { api: { dev: { port: 4100 } } } }, {})
    assert.deepEqual(plan, { mode: 'inline', port: 3000 })
  })

  test('the local environment still names the lone backend port', () => {
    const plan = planDev(
      {
        backends: { api: {} },
        environments: {
          local: {
            backends: { api: { url: 'http://localhost:4555' } },
            frontends: {},
          },
        },
      },
      {}
    )
    assert.deepEqual(plan, { mode: 'inline', port: 4555 })
  })

  test('frontends and no backend plan frontends only', () => {
    assert.deepEqual(planDev({ frontends: { web: {} } }, {}), {
      mode: 'frontends',
    })
  })

  test('an addon with no backend keeps the inline server', () => {
    const plan = planDev({ addon: true, frontends: { web: {} } }, {})
    assert.equal(plan.mode, 'inline')
  })

  test('--backend with no backend declared lists (none)', () => {
    assert.throws(
      () => planDev({ frontends: { web: {} } }, { backend: 'api' }),
      /Declared backends: \(none\)/
    )
  })

  test('several backends become one process each on their own port', () => {
    const plan = planDev(two, {})
    assert.equal(plan.mode, 'parent')
    if (plan.mode !== 'parent') return
    assert.deepEqual(
      plan.processes.map((p) => [p.name, p.port]),
      [
        ['web', 4101],
        ['admin', 4102],
      ]
    )
    assert.deepEqual(plan.processes[0]!.args, [
      'dev',
      '--backend',
      'web',
      '--port',
      '4101',
      '--serveOnly',
      '--no-watch',
      '--no-frontends',
    ])
  })

  test('flags the user gave reach every backend process', () => {
    const plan = planDev(two, {
      passthrough: {
        config: 'x.json',
        coverage: true,
        test: true,
        model: 'a:b/c',
        hmr: false,
      },
    })
    assert.equal(plan.mode, 'parent')
    if (plan.mode !== 'parent') return
    for (const { args } of plan.processes) {
      for (const flag of [
        '--config=x.json',
        '--coverage',
        '--test',
        '--model=a:b/c',
        '--no-hmr',
      ]) {
        assert.ok(args.includes(flag), `${flag} in ${args.join(' ')}`)
      }
    }
  })

  test('--backend narrows to one inline process on that backend port', () => {
    assert.deepEqual(planDev(two, { backend: 'admin' }), {
      mode: 'inline',
      backend: 'admin',
      port: 4102,
    })
  })

  test('--port wins for a named backend', () => {
    assert.deepEqual(planDev(two, { backend: 'admin', port: '5000' }), {
      mode: 'inline',
      backend: 'admin',
      port: 5000,
    })
  })

  test('--port with several backends selected is refused', () => {
    assert.throws(() => planDev(two, { port: '5000' }), /--backend/)
  })

  test('an unknown backend names the declared ones', () => {
    assert.throws(
      () => planDev(two, { backend: 'nope' }),
      /Declared backends: web, admin/
    )
  })

  test('a backend with no port is refused when several run', () => {
    assert.throws(
      () => planDev({ backends: { a: { dev: { port: 1 } }, b: {} } }, {}),
      /backends\.b\.dev\.port is required/
    )
  })
})

describe('startDevBackends', () => {
  const script = (body: string) => ({
    execPath: process.execPath,
    leading: ['-e', body],
  })

  test('waits for every ready line, prefixes output, and relays reloads', async () => {
    const lines: string[] = []
    const running = await startDevBackends({
      processes: [
        { name: 'web', port: 47101, args: [] },
        { name: 'admin', port: 47102, args: [] },
      ],
      cwd: process.cwd(),
      write: (line) => lines.push(line),
      command: script(
        `process.on('SIGUSR2',()=>console.log('reloaded'));console.log(${JSON.stringify(SERVER_READY_MARKER)});setInterval(()=>{},1000)`
      ),
    })
    running.reload()
    const deadline = Date.now() + 5000
    while (
      lines.filter((l) => l.endsWith('reloaded')).length < 2 &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 25))
    }
    await running.stop()
    assert.ok(lines.includes('[web  ] reloaded'), lines.join('|'))
    assert.ok(lines.includes('[admin] reloaded'), lines.join('|'))
  })

  test('a backend that dies before it is ready fails the start', async () => {
    await assert.rejects(
      startDevBackends({
        processes: [{ name: 'web', port: 47103, args: [] }],
        cwd: process.cwd(),
        write: () => {},
        command: script('process.exit(3)'),
      }),
      /backend "web" exited with code 3/
    )
  })

  test('a backend that exits later settles failure', async () => {
    const running = await startDevBackends({
      processes: [{ name: 'web', port: 47104, args: [] }],
      cwd: process.cwd(),
      write: () => {},
      command: script(
        `console.log(${JSON.stringify(SERVER_READY_MARKER)});setTimeout(()=>process.exit(2),200)`
      ),
    })
    const failure = await running.failure
    assert.equal(failure.name, 'web')
    assert.match(failure.reason, /exited/)
  })
})
