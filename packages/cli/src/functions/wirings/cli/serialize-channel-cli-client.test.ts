import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeChannelCLIClient } from './serialize-channel-cli-client.js'
import type { CLIProgramMeta } from '@pikku/core/cli'
import type { Config } from '../../../../types/application-types.js'

const config = { packageMappings: {} } as Config
const clientFile = '/proj/packages/sdk/src/pikku/cli-client.gen.ts'
const bootstrapFile = '/proj/packages/functions/.pikku/pikku-bootstrap.gen.ts'

const programMeta = (): CLIProgramMeta => ({
  program: 'kanban',
  commands: {
    list: { pikkuFuncId: 'listCards@v2', renderName: 'cardsRenderer' } as any,
    add: { pikkuFuncId: 'createCard@v2', renderName: 'cardRenderer' } as any,
  },
  options: {},
  defaultRenderName: 'kanbanResultRenderer',
})

describe('serializeChannelCLIClient', () => {
  test('renderName with no importable binding → empty renderers map, no defaultRenderer, valid JS (no bare renderer identifiers)', () => {
    // renderersMeta omitted: every renderName is unresolvable. The original bug
    // emitted the bare name (e.g. `cli-render:kanban:list`) here, breaking parse.
    const out = serializeChannelCLIClient(
      'kanban',
      programMeta(),
      clientFile,
      config,
      bootstrapFile
    )
    assert.match(out, /const renderers = \{\}/)
    assert.doesNotMatch(out, /defaultRenderer:/)
    // No unresolved renderer names leak into the output as identifiers.
    assert.doesNotMatch(out, /cardsRenderer|cardRenderer|kanbanResultRenderer/)
  })

  test('renderName resolved via renderersMeta.exportedName → imports binding, maps command id → binding, sets default', () => {
    const renderersMeta = {
      cardsRenderer: {
        name: 'cardsRenderer',
        exportedName: 'cardsRenderer',
        filePath: '/proj/packages/functions/src/wirings/kanban.cli.ts',
      },
      cardRenderer: {
        name: 'cardRenderer',
        exportedName: 'cardRenderer',
        filePath: '/proj/packages/functions/src/wirings/kanban.cli.ts',
      },
      kanbanResultRenderer: {
        name: 'kanbanResultRenderer',
        exportedName: 'kanbanResultRenderer',
        filePath: '/proj/packages/functions/src/wirings/kanban.cli.ts',
      },
    }
    const out = serializeChannelCLIClient(
      'kanban',
      programMeta(),
      clientFile,
      config,
      bootstrapFile,
      undefined,
      renderersMeta
    )
    // Bindings imported from the renderer source file (order-independent).
    const importLine = out.match(
      /import \{ ([^}]*) \} from '[^']*kanban\.cli\.js'/
    )
    assert.ok(importLine, 'expected an import from the renderer source file')
    const imported = importLine![1]
      .split(',')
      .map((s) => s.trim())
      .sort()
    assert.deepStrictEqual(imported, [
      'cardRenderer',
      'cardsRenderer',
      'kanbanResultRenderer',
    ])
    assert.match(out, /'list': cardsRenderer/)
    assert.match(out, /'add': cardRenderer/)
    assert.match(out, /defaultRenderer: kanbanResultRenderer/)
  })

  test('dedups a binding shared by multiple renderNames into a single import', () => {
    // Two distinct renderNames resolving to the same exported binding.
    const meta = programMeta()
    ;(meta.commands.add as any).renderName = 'cardsRenderer'
    const renderersMeta = {
      cardsRenderer: {
        name: 'cardsRenderer',
        exportedName: 'cardsRenderer',
        filePath: '/proj/packages/functions/src/wirings/kanban.cli.ts',
      },
      kanbanResultRenderer: {
        name: 'kanbanResultRenderer',
        exportedName: 'kanbanResultRenderer',
        filePath: '/proj/packages/functions/src/wirings/kanban.cli.ts',
      },
    }
    const out = serializeChannelCLIClient(
      'kanban',
      meta,
      clientFile,
      config,
      bootstrapFile,
      undefined,
      renderersMeta
    )
    const importLine = out.match(
      /import \{ ([^}]*) \} from '[^']*kanban\.cli\.js'/
    )
    assert.ok(importLine, 'expected an import from the renderer source file')
    const imported = importLine![1]
      .split(',')
      .map((s) => s.trim())
      .sort()
    assert.deepStrictEqual(imported, ['cardsRenderer', 'kanbanResultRenderer'])
    // cardsRenderer appears exactly 3×: import (once, deduped) + list + add maps.
    const occurrences = out.match(/cardsRenderer/g) ?? []
    assert.strictEqual(occurrences.length, 3)
  })
})
