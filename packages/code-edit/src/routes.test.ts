import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import {
  discoverPages,
  discoverRoutes,
  navigablePaths,
  resolveRoutePath,
  routeIdToPath,
  routeParams,
} from './routes.js'

const route = (id: string, lazy = false) =>
  `import { create${lazy ? 'Lazy' : ''}FileRoute } from '@tanstack/react-router'\nexport const Route = create${lazy ? 'Lazy' : ''}FileRoute('${id}')({})\n`

const workspace = async (
  apps: Record<string, Record<string, string>>
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-routes-'))
  for (const [app, files] of Object.entries(apps)) {
    for (const [file, content] of Object.entries(files)) {
      const path = join(root, app, 'src/routes', file)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content)
    }
  }
  return root
}

describe('routeIdToPath', () => {
  test('drops pathless layouts and groups, strips the layout escape', () => {
    assert.strictEqual(routeIdToPath('/'), '/')
    assert.strictEqual(routeIdToPath('/app/'), '/app')
    assert.strictEqual(routeIdToPath('/app_/login'), '/app/login')
    assert.strictEqual(routeIdToPath('/_auth/dashboard'), '/dashboard')
    assert.strictEqual(routeIdToPath('/(admin)/users/$id'), '/users/$id')
  })
})

describe('routeParams / resolveRoutePath', () => {
  test('names params and fills the ones it knows', () => {
    assert.deepStrictEqual(routeParams('/$lang/posts/$postId/$'), [
      'lang',
      'postId',
      '_splat',
    ])
    assert.strictEqual(resolveRoutePath('/$lang/about'), '/en/about')
    assert.strictEqual(resolveRoutePath('/posts/$postId'), null)
    assert.strictEqual(
      resolveRoutePath('/posts/$postId', { postId: '7' }),
      '/posts/7'
    )
    assert.strictEqual(resolveRoutePath('/{-$region}/shop'), '/shop')
  })

  test('splits pages into openable paths and ones waiting on a param', () => {
    const page = (path: string) => ({
      app: 'apps/app',
      path,
      file: '',
      params: routeParams(path),
    })
    const { paths, skipped } = navigablePaths(
      [page('/'), page('/$lang/about'), page('/posts/$postId')],
      { lang: 'de' }
    )
    assert.deepStrictEqual(paths, ['/', '/de/about'])
    assert.deepStrictEqual(
      skipped.map((p) => p.path),
      ['/posts/$postId']
    )
  })
})

describe('discoverPages', () => {
  test('reads the team-saas layout: layouts collapse into their index, escapes resolve', async () => {
    const root = await workspace({
      'apps/app': {
        '__root.tsx': 'export const Route = createRootRoute({})',
        'index.tsx': route('/'),
        'app.tsx': route('/app'),
        'app.index.tsx': route('/app/'),
        'app.issues.tsx': route('/app/issues'),
        'app_.login.tsx': route('/app_/login'),
        '_auth.tsx': route('/_auth'),
        '_auth.settings.tsx': route('/_auth/settings'),
        'posts/$postId.tsx': route('/posts/$postId'),
        'posts/$postId.lazy.tsx': route('/posts/$postId', true),
        '-components/Thing.tsx': route('/nope'),
        'routeTree.gen.ts': route('/gen'),
      },
      'packages/functions': { 'unrelated.ts': 'export {}' },
    })
    const pages = await discoverPages(root)
    assert.deepStrictEqual(
      pages.map(({ path, file }) => [path, file]),
      [
        ['/', 'apps/app/src/routes/index.tsx'],
        ['/app', 'apps/app/src/routes/app.index.tsx'],
        ['/app/issues', 'apps/app/src/routes/app.issues.tsx'],
        ['/app/login', 'apps/app/src/routes/app_.login.tsx'],
        ['/posts/$postId', 'apps/app/src/routes/posts/$postId.tsx'],
        ['/settings', 'apps/app/src/routes/_auth.settings.tsx'],
      ]
    )
    assert.ok(pages.every((page) => page.app === 'apps/app'))
    assert.deepStrictEqual(
      pages.find((page) => page.path === '/posts/$postId')?.params,
      ['postId']
    )
  })

  test('merges every frontend for the route list', async () => {
    const root = await workspace({
      'apps/app': { 'index.tsx': route('/'), 'a.tsx': route('/a') },
      'apps/admin': { 'index.tsx': route('/'), 'b.tsx': route('/b') },
    })
    assert.deepStrictEqual(await discoverRoutes(root), ['/', '/a', '/b'])
    assert.deepStrictEqual(
      (await discoverPages(root, { apps: ['apps/admin'] })).map((p) => p.path),
      ['/', '/b']
    )
    await assert.rejects(discoverPages(root, { apps: ['../elsewhere'] }))
  })
})
