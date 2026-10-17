import { test, describe } from 'node:test'
import * as assert from 'assert'
import { TypesMap } from '../../../inspector/src/types-map.js'
import type { Logger } from '@pikku/core/services'
import type { QueueWorkersMeta } from '@pikku/core/queue'
import {
  serializeCustomTypesFile,
  serializeCustomTypesImport,
} from './custom-types-file.js'
import { serializeQueueMap } from '../functions/wirings/queue/serialize-queue-map.js'
import { serializeTypedRPCMap } from '../functions/wirings/rpc/serialize-typed-rpc-map.js'
import { serializeTypedChannelsMap } from '../functions/wirings/channels/serialize-typed-channel-map.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

const OUT = '/proj/.pikku'
const CUSTOM_TYPES_FILE = `${OUT}/pikku-custom-types.gen.d.ts`

const projectTypesMap = () => {
  const typesMap = new TypesMap()
  typesMap.addType('ShippingAddress', '/proj/src/checkout.types.ts')
  typesMap.addCustomType(
    'CreateOrderInput',
    '{ address: ShippingAddress; note?: string }',
    ['ShippingAddress']
  )
  typesMap.addCustomType('CreateOrderOutput', '{ orderId: string }', [])
  return typesMap
}

const declarationsOf = (content: string, name: string) =>
  content.match(new RegExp(`export type ${name} = \\{`, 'g'))?.length ?? 0

describe('serializeCustomTypesFile', () => {
  test('declares every custom type, with imports relative to itself', () => {
    const content = serializeCustomTypesFile(
      CUSTOM_TYPES_FILE,
      {},
      projectTypesMap()
    )
    assert.strictEqual(declarationsOf(content, 'CreateOrderInput'), 1)
    assert.strictEqual(declarationsOf(content, 'CreateOrderOutput'), 1)
    assert.match(
      content,
      /import type \{ ShippingAddress \} from '\.\.\/src\/checkout\.types\.js'/
    )
  })

  test('emits no absolute import path', () => {
    const content = serializeCustomTypesFile(
      CUSTOM_TYPES_FILE,
      {},
      projectTypesMap()
    )
    assert.doesNotMatch(content, /from '\//)
  })
})

describe('serializeCustomTypesImport', () => {
  test('aliases each custom type from the shared file, relative to the map', () => {
    const content = serializeCustomTypesImport(
      `${OUT}/rpc/pikku-rpc-wirings-map.gen.d.ts`,
      CUSTOM_TYPES_FILE,
      {},
      projectTypesMap()
    )
    assert.strictEqual(
      content,
      [
        "import type * as __PikkuCustomTypes from '../pikku-custom-types.gen.d.js'",
        'export type CreateOrderInput = __PikkuCustomTypes.CreateOrderInput',
        'export type CreateOrderOutput = __PikkuCustomTypes.CreateOrderOutput',
      ].join('\n')
    )
  })

  test('emits nothing when the project has no custom types', () => {
    assert.strictEqual(
      serializeCustomTypesImport(
        `${OUT}/rpc/pikku-rpc-wirings-map.gen.d.ts`,
        CUSTOM_TYPES_FILE,
        {},
        new TypesMap()
      ),
      ''
    )
  })
})

describe('typed maps', () => {
  const maps = () => {
    const typesMap = projectTypesMap()
    const resolvedIOTypes = {
      createOrder: {
        inputType: 'CreateOrderInput',
        outputType: 'CreateOrderOutput',
      },
    }
    return {
      queue: serializeQueueMap(
        logger,
        `${OUT}/queue/pikku-queue-workers-wirings-map.gen.d.ts`,
        {},
        typesMap,
        {
          orders: { name: 'orders', pikkuFuncId: 'createOrder' },
        } as unknown as QueueWorkersMeta,
        resolvedIOTypes,
        CUSTOM_TYPES_FILE
      ),
      rpc: serializeTypedRPCMap(
        logger,
        `${OUT}/rpc/pikku-rpc-wirings-map.gen.d.ts`,
        {},
        typesMap,
        { createOrder: 'createOrder' },
        resolvedIOTypes,
        CUSTOM_TYPES_FILE
      ),
      channel: serializeTypedChannelsMap(
        logger,
        `${OUT}/channel/pikku-channels-map.gen.d.ts`,
        {},
        typesMap,
        {},
        {},
        {},
        `${OUT}/rpc/pikku-rpc-wirings-map.internal.gen.d.ts`,
        CUSTOM_TYPES_FILE
      ),
    }
  }

  test('no map carries its own copy of a custom type declaration', () => {
    for (const [name, content] of Object.entries(maps())) {
      assert.strictEqual(
        declarationsOf(content, 'CreateOrderInput'),
        0,
        `${name} map redeclares CreateOrderInput`
      )
      assert.match(
        content,
        /export type CreateOrderInput = __PikkuCustomTypes\.CreateOrderInput/,
        `${name} map no longer exports CreateOrderInput`
      )
    }
  })

  test('every map imports the shared file by a relative path, and nothing absolutely', () => {
    for (const [name, content] of Object.entries(maps())) {
      assert.match(
        content,
        /from '\.\.\/pikku-custom-types\.gen\.d\.js'/,
        `${name} map does not import the shared custom types`
      )
      assert.doesNotMatch(
        content,
        /from '\//,
        `${name} map has an absolute import`
      )
    }
  })

  test('a map no longer imports the source types only its custom types use', () => {
    for (const [name, content] of Object.entries(maps())) {
      assert.doesNotMatch(
        content,
        /ShippingAddress/,
        `${name} map still imports ShippingAddress`
      )
    }
  })
})
