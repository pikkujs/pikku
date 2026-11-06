import assert from 'node:assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateRouteTrees, routeWatchPaths } from './route-tree.js'

/** Records what it was given: the real one is proved against a real project. */
const FAKE_GENERATOR = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
export const getConfig = (inline, dir) => ({ ...inline, dir })
export class Generator {
  constructor({ config, root }) { this.config = config; this.root = root }
  async run() {
    if (process.env.FAKE_GENERATOR_FAILS) throw new Error('two routes share /a')
    writeFileSync(join(this.root, 'config.json'), JSON.stringify(this.config))
  }
}
`

const frontend = ({
  packageJson = {},
  routes = true,
  generator = true,
  files = {},
}: {
  packageJson?: object
  routes?: boolean
  generator?: boolean
  files?: Record<string, string>
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-routes-'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      devDependencies: { '@tanstack/router-generator': '1' },
      ...packageJson,
    })
  )
  mkdirSync(join(dir, 'src'))
  if (routes) mkdirSync(join(dir, 'src/routes'))
  if (generator) {
    const root = join(dir, 'node_modules/@tanstack/router-generator')
    mkdirSync(root, { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ exports: { '.': { import: { default: './i.mjs' } } } })
    )
    writeFileSync(join(root, 'i.mjs'), FAKE_GENERATOR)
  }
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content)
  }
  return dir
}

const seen = (dir: string) =>
  JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))

test('the routes and the tree are watched, at the defaults', () => {
  const dir = frontend({})
  assert.deepEqual(routeWatchPaths([dir]), [
    join(dir, 'src/routes'),
    join(dir, 'src/routeTree.gen.ts'),
  ])
})

test('tsr.config.json moves them', () => {
  const dir = frontend({
    routes: false,
    files: {
      'tsr.config.json': JSON.stringify({
        routesDirectory: 'pages',
        generatedRouteTree: 'tree.gen.ts',
      }),
    },
  })
  mkdirSync(join(dir, 'pages'))
  assert.deepEqual(routeWatchPaths([dir]), [
    join(dir, 'pages'),
    join(dir, 'tree.gen.ts'),
  ])
})

test('a frontend without file routes is left alone', async () => {
  const noRoutes = frontend({ routes: false })
  const noTooling = frontend({ packageJson: { devDependencies: {} } })
  assert.deepEqual(routeWatchPaths([noRoutes, noTooling]), [])
  assert.deepEqual(await generateRouteTrees([noRoutes, noTooling]), [])
  assert.equal(existsSync(join(noRoutes, 'config.json')), false)
})

test('react-start adds its footer, typing the router', async () => {
  const dir = frontend({
    packageJson: { dependencies: { '@tanstack/react-start': '1' } },
    files: {},
  })
  writeFileSync(join(dir, 'src/router.tsx'), '')
  assert.deepEqual(await generateRouteTrees([dir]), [])
  const { routeTreeFileFooter, target, disableLogging } = seen(dir)
  assert.equal(target, 'react')
  assert.equal(disableLogging, true)
  assert.match(routeTreeFileFooter[0], /from '\.\/router\.tsx'/)
  assert.match(routeTreeFileFooter[0], /import type { createStart }/)
  assert.match(
    routeTreeFileFooter[0],
    /declare module '@tanstack\/react-start'/
  )
})

test('a start entry joins the footer', async () => {
  const dir = frontend({
    packageJson: { dependencies: { '@tanstack/react-start': '1' } },
  })
  writeFileSync(join(dir, 'src/router.tsx'), '')
  writeFileSync(join(dir, 'src/start.ts'), '')
  await generateRouteTrees([dir])
  assert.match(seen(dir).routeTreeFileFooter[0], /startInstance\.getOptions/)
})

test('plain router projects get no start footer', async () => {
  const dir = frontend({
    packageJson: { dependencies: { '@tanstack/solid-router': '1' } },
  })
  await generateRouteTrees([dir])
  assert.equal(seen(dir).target, 'solid')
  assert.equal(seen(dir).routeTreeFileFooter, undefined)
})

test('the generator is found through the tooling', async () => {
  const dir = frontend({
    packageJson: { devDependencies: { '@tanstack/router-plugin': '1' } },
    generator: false,
  })
  const plugin = join(dir, 'node_modules/@tanstack/router-plugin')
  const nested = join(plugin, 'node_modules/@tanstack/router-generator')
  mkdirSync(nested, { recursive: true })
  writeFileSync(
    join(nested, 'package.json'),
    JSON.stringify({ exports: { '.': { import: './i.mjs' } } })
  )
  writeFileSync(join(nested, 'i.mjs'), FAKE_GENERATOR)
  assert.deepEqual(await generateRouteTrees([dir]), [])
  assert.equal(existsSync(join(dir, 'config.json')), true)
})

test('a failed generator names the frontend and the reason', async () => {
  const dir = frontend({})
  process.env.FAKE_GENERATOR_FAILS = '1'
  try {
    const [problem, ...rest] = await generateRouteTrees([dir])
    assert.deepEqual(rest, [])
    assert.equal(problem?.code, 'ROUTES')
    assert.equal(problem?.severity, 'error')
    assert.ok(problem?.message.includes(dir))
    assert.match(problem?.message ?? '', /two routes share \/a/)
  } finally {
    delete process.env.FAKE_GENERATOR_FAILS
  }
})

test('no generator to run is a failure saying what to install', async () => {
  const [problem] = await generateRouteTrees([frontend({ generator: false })])
  assert.match(problem?.message ?? '', /router-generator is not installed/)
})

test('a routes script is preferred', async () => {
  const dir = frontend({
    packageJson: {
      devDependencies: { '@tanstack/router-generator': '1' },
      scripts: { 'generate:routes': 'node -e "process.exit(0)"' },
    },
  })
  assert.deepEqual(await generateRouteTrees([dir]), [])
  assert.equal(existsSync(join(dir, 'config.json')), false)
})

test('a failing routes script is a failure', async () => {
  const dir = frontend({
    packageJson: {
      devDependencies: { '@tanstack/router-generator': '1' },
      scripts: { routes: 'node -e "process.exit(3)"' },
    },
  })
  const [problem] = await generateRouteTrees([dir])
  assert.equal(problem?.code, 'ROUTES')
  assert.match(problem?.message ?? '', /routes script/)
})
