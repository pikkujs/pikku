import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { testIds } from './test-ids.js'

type Transform = (code: string, id: string) => Promise<{ code: string } | null>

const transform = (): Transform => testIds().transform as unknown as Transform

describe('testIds', () => {
  test('runs before other plugins and in a build, so scenarios can address a built app', () => {
    const plugin = testIds()
    assert.equal(plugin.enforce, 'pre')
    assert.equal(plugin.apply, undefined)
  })

  test('stamps the i18n message key on a control and the component name on its root', async () => {
    const out = await transform()(
      `import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'
export function EntryForm() {
  return <form><Button>{m.common__save()}</Button></form>
}
`,
      '/app/src/EntryForm.tsx'
    )
    assert.match(out!.code, /data-testid="common__save"/)
    assert.match(out!.code, /data-testid="entry-form"/)
  })

  test('skips files that are not JSX and anything under node_modules', async () => {
    assert.equal(await transform()('export const x = 1', '/app/src/x.ts'), null)
    assert.equal(
      await transform()('export const x = <b/>', '/app/node_modules/pkg/x.tsx'),
      null
    )
  })
})
