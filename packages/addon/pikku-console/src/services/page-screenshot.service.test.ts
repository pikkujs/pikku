import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { PagesService } from '@pikku/code-edit/routes'
import { PageScreenshotService } from './page-screenshot.service.js'

const workspace = async (apps: string[]): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-console-pages-'))
  for (const app of apps) {
    await mkdir(join(root, app, 'src/routes'), { recursive: true })
    await writeFile(
      join(root, app, 'src/routes/index.tsx'),
      "export const Route = createFileRoute('/')({})\n"
    )
  }
  return root
}

describe('PageScreenshotService', () => {
  test('refuses before opening a browser when the request cannot be answered', async () => {
    const root = await workspace(['apps/a', 'apps/b'])
    const two = new PageScreenshotService(new PagesService(root), root)
    await assert.rejects(
      two.capture({ baseUrl: 'http://localhost:1' }),
      /Several frontends have routes \(apps\/a, apps\/b\); pass app/
    )
    await assert.rejects(
      two.capture({ baseUrl: 'file:///etc/passwd', app: 'apps/a' }),
      /http\(s\) url/
    )
    await assert.rejects(
      two.capture({
        baseUrl: 'http://localhost:1',
        app: 'apps/a',
        paths: ['//evil.test/'],
      }),
      /origin-relative/
    )
    const empty = await workspace([])
    const none = new PageScreenshotService(new PagesService(empty), empty)
    await assert.rejects(
      none.capture({ baseUrl: 'http://localhost:1' }),
      /No frontend has TanStack file routes/
    )
  })
})
