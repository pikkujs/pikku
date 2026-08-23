import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeTanStackStartShim } from './serialize-tanstack-start-shim.js'

const emit = () => serializeTanStackStartShim('../pikku-rpc.gen.js')

describe('serializeTanStackStartShim', () => {
  test('emits a file that parses', () => {
    const sf = ts.createSourceFile(
      'shim.gen.ts',
      emit(),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS
    )
    assert.deepStrictEqual(
      (sf.parseDiagnostics ?? []).map((d) =>
        ts.flattenDiagnosticMessageText(d.messageText, ' ')
      ),
      []
    )
  })

  test('imports PikkuRPC from the path it was given', () => {
    assert.match(emit(), /import \{ PikkuRPC \} from '\.\.\/pikku-rpc\.gen\.js'/)
  })

  test('falls back to the page origin instead of throwing in the browser', () => {
    const content = emit()

    assert.match(content, /return window\.location\.origin \+ '\/api'/)
    assert.doesNotMatch(
      content.split('if (import.meta.env.SSR)')[0]!,
      /throw new Error/
    )
  })

  test('ignores a localhost base served from a real origin', () => {
    const content = emit()

    assert.match(content, /const remote = !LOCAL_HOSTNAME\.test\(window\.location\.hostname\)/)
    assert.match(content, /if \(configured && !\(remote && LOCAL_BASE\.test\(configured\)\)\)/)
  })

  test('reads a runtime binding during SSR, where there is no origin', () => {
    const content = emit()
    const ssr = content.split('if (import.meta.env.SSR)')[1]!

    assert.match(ssr, /env\?\.PIKKU_API_URL \?\? env\?\.VITE_API_URL \?\? configured/)
    assert.match(ssr, /throw new Error/)
  })

  test('reaches process through globalThis, so a browser tsconfig still builds', () => {
    assert.match(emit(), /\(globalThis as \{ process\?: /)
    assert.doesNotMatch(emit(), /(?<!globalThis as \{ )\bprocess\.env\b/)
  })
})
