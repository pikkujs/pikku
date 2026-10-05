import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { getOrCreatePackageSingletonServices } from './addon-runner.js'
import { wireAddon } from './wire-addon.js'
import { ScopedContentService } from '../../services/scoped-content-service.js'
import type { ContentService } from '../../services/content-service.js'
import type { CoreSingletonServices } from '../../types/core.types.js'

type Call = { method: string; bucket?: string; key?: string }

const recordingContent = () => {
  const calls: Call[] = []
  const service = {
    signContentKey: async (a: any) => {
      calls.push({
        method: 'signContentKey',
        bucket: a.bucket,
        key: a.contentKey,
      })
      return 'signed'
    },
    signURL: async () => {
      calls.push({ method: 'signURL' })
      return 'signed-url'
    },
    getUploadURL: async (a: any) => {
      calls.push({ method: 'getUploadURL', bucket: a.bucket, key: a.fileKey })
      return { uploadUrl: 'u', assetKey: `${a.bucket}/${a.fileKey}` }
    },
    deleteFile: async (a: any) => {
      calls.push({ method: 'deleteFile', bucket: a.bucket, key: a.key })
      return true
    },
    writeFile: async (a: any) => {
      calls.push({ method: 'writeFile', bucket: a.bucket, key: a.key })
      return true
    },
    copyFile: async () => {
      calls.push({ method: 'copyFile' })
      return true
    },
    readFile: async (a: any) => {
      calls.push({ method: 'readFile', bucket: a.bucket, key: a.key })
      return new ReadableStream()
    },
    readFileAsBuffer: async (a: any) => {
      calls.push({ method: 'readFileAsBuffer', bucket: a.bucket, key: a.key })
      return Buffer.from('x')
    },
  } as unknown as ContentService
  return { calls, service }
}

const reads = {
  signContentKey: (s: ContentService, b: string, k: string) =>
    s.signContentKey({ bucket: b, contentKey: k, dateLessThan: new Date() }),
  readFile: (s: ContentService, b: string, k: string) =>
    s.readFile({ bucket: b, key: k }),
  readFileAsBuffer: (s: ContentService, b: string, k: string) =>
    s.readFileAsBuffer({ bucket: b, key: k }),
}

const writes = {
  getUploadURL: (s: ContentService, b: string, k: string) =>
    s.getUploadURL({ bucket: b, fileKey: k, contentType: 'text/plain' }),
  writeFile: (s: ContentService, b: string, k: string) =>
    s.writeFile({ bucket: b, key: k, stream: new ReadableStream() }),
  deleteFile: (s: ContentService, b: string, k: string) =>
    s.deleteFile({ bucket: b, key: k }),
}

const everything = { ...reads, ...writes }

const DENIED = /denied/i

describe('a scoped content service keeps an addon inside its own folder', () => {
  let calls: Call[]
  let spindle: ContentService

  beforeEach(() => {
    const fake = recordingContent()
    calls = fake.calls
    spindle = new ScopedContentService(fake.service, 'spindle')
  })

  for (const [name, call] of Object.entries(everything)) {
    test(`${name} lands under the addon's own folder`, async () => {
      await call(spindle, 'library', 'org/file.txt')
      assert.deepEqual(calls, [
        { method: name, bucket: 'spindle/library', key: 'org/file.txt' },
      ])
    })

    test(`${name} with an empty bucket lands in the addon's root`, async () => {
      await call(spindle, '', 'a.txt')
      assert.equal(calls[0]?.bucket, 'spindle')
    })

    test(`${name} cannot name another addon's folder without a grant`, async () => {
      await assert.rejects(
        () => call(spindle, '@reports/exports', 'summary.pdf'),
        DENIED
      )
      await assert.rejects(
        () => call(spindle, '@reports', 'summary.pdf'),
        DENIED
      )
      assert.deepEqual(calls, [])
    })
  }

  const escapes = [
    '../reports/exports/summary.pdf',
    'a/../../reports/summary.pdf',
    '..',
    '.',
    './x',
    '/reports/summary.pdf',
    '\\reports\\summary.pdf',
    '..\\reports\\summary.pdf',
    '%2e%2e/reports/summary.pdf',
    '%2E%2E%2Freports%2Fsummary.pdf',
    '%252e%252e/reports/summary.pdf',
    '%25252e%25252e%25252freports',
    'a%00b',
    '%',
  ]

  for (const [name, call] of Object.entries(everything)) {
    for (const escape of escapes) {
      test(`${name} refuses the key ${JSON.stringify(escape)}`, async () => {
        await assert.rejects(() => call(spindle, 'library', escape), DENIED)
        assert.deepEqual(calls, [])
      })

      test(`${name} refuses the bucket ${JSON.stringify(escape)}`, async () => {
        await assert.rejects(() => call(spindle, escape, 'a.txt'), DENIED)
        assert.deepEqual(calls, [])
      })
    }
  }

  test('a path from the root that lands back in its own folder is its own', async () => {
    await spindle.readFile({ bucket: '@spindle/library', key: 'a.txt' })
    await spindle.deleteFile({ bucket: '@spindle', key: 'library/a.txt' })
    assert.deepEqual(calls, [
      { method: 'readFile', bucket: 'spindle/library', key: 'a.txt' },
      { method: 'deleteFile', bucket: 'spindle', key: 'library/a.txt' },
    ])
  })

  test('a path from the root that only starts like its own folder is not its own', async () => {
    await assert.rejects(
      () => spindle.readFile({ bucket: '@spindle-private', key: 'a.txt' }),
      DENIED
    )
    await assert.rejects(
      () => spindle.readFile({ bucket: '@spind', key: 'le/a.txt' }),
      DENIED
    )
    assert.deepEqual(calls, [])
  })

  test('signURL is refused', async () => {
    await assert.rejects(
      () =>
        spindle.signURL({
          url: 'https://store/reports/x',
          dateLessThan: new Date(),
        }),
      /not allowed/
    )
    assert.deepEqual(calls, [])
  })

  test('copyFile is refused, so no local file can be read through it', async () => {
    await assert.rejects(
      () =>
        spindle.copyFile({
          bucket: 'library',
          key: 'a.txt',
          fromAbsolutePath: '/etc/passwd',
        }),
      /not allowed/
    )
    assert.deepEqual(calls, [])
  })
})

describe('content grants decide what an addon may use outside its folder', () => {
  let calls: Call[]
  let fake: ContentService

  beforeEach(() => {
    const recording = recordingContent()
    calls = recording.calls
    fake = recording.service
  })

  const scoped = (grants: Record<string, 'read' | 'write'>) =>
    new ScopedContentService(fake, 'reports', grants)

  for (const [name, call] of Object.entries(reads)) {
    test(`a read grant allows ${name}`, async () => {
      await call(scoped({ spindle: 'read' }), '@spindle/library', 'a.txt')
      assert.equal(calls[0]?.bucket, 'spindle/library')
      assert.equal(calls[0]?.key, 'a.txt')
    })
  }

  for (const [name, call] of Object.entries(writes)) {
    test(`a read grant does not allow ${name}`, async () => {
      await assert.rejects(
        () => call(scoped({ spindle: 'read' }), '@spindle/library', 'a.txt'),
        DENIED
      )
      assert.deepEqual(calls, [])
    })

    test(`a write grant allows ${name}`, async () => {
      await call(scoped({ spindle: 'write' }), '@spindle/library', 'a.txt')
      assert.equal(calls[0]?.bucket, 'spindle/library')
    })
  }

  for (const [name, call] of Object.entries(reads)) {
    test(`a write grant also allows ${name}`, async () => {
      await call(scoped({ spindle: 'write' }), '@spindle', 'library/a.txt')
      assert.equal(calls[0]?.bucket, 'spindle')
      assert.equal(calls[0]?.key, 'library/a.txt')
    })
  }

  test('a grant on a deeper prefix does not open its parent', async () => {
    const service = scoped({ 'spindle/library': 'read' })
    await service.readFile({ bucket: '@spindle/library', key: 'a.txt' })
    await assert.rejects(
      () => service.readFile({ bucket: '@spindle/frames', key: 'a.txt' }),
      DENIED
    )
    await assert.rejects(
      () => service.readFile({ bucket: '@spindle', key: 'a.txt' }),
      DENIED
    )
  })

  test('a grant matches whole path segments: spindle does not open spindle-private', async () => {
    const service = scoped({ spindle: 'write' })
    await assert.rejects(
      () => service.readFile({ bucket: '@spindle-private', key: 'a.txt' }),
      DENIED
    )
    await assert.rejects(
      () =>
        service.writeFile({
          bucket: '@spindle-private/x',
          key: 'a',
          stream: new ReadableStream(),
        }),
      DENIED
    )
    await assert.rejects(
      () => service.readFile({ bucket: '@spind', key: 'le/a.txt' }),
      DENIED
    )
    assert.deepEqual(calls, [])
  })

  test('the longest matching prefix decides, in either direction', async () => {
    const service = scoped({ spindle: 'write', 'spindle/library': 'read' })
    await service.writeFile({
      bucket: '@spindle/frames',
      key: 'a.jpg',
      stream: new ReadableStream(),
    })
    await assert.rejects(
      () =>
        service.writeFile({
          bucket: '@spindle/library',
          key: 'a.txt',
          stream: new ReadableStream(),
        }),
      DENIED
    )
    const reverse = scoped({ spindle: 'read', 'spindle/library': 'write' })
    await reverse.deleteFile({ bucket: '@spindle/library', key: 'a.txt' })
    await assert.rejects(
      () => reverse.deleteFile({ bucket: '@spindle/frames', key: 'a.jpg' }),
      DENIED
    )
  })

  test('a grant opens nothing it was not granted, even next to it', async () => {
    const service = scoped({ spindle: 'read' })
    await assert.rejects(
      () => service.readFile({ bucket: '@crm', key: 'a.txt' }),
      DENIED
    )
    await assert.rejects(
      () => service.readFile({ bucket: '@', key: 'crm/a.txt' }),
      DENIED
    )
    await service.readFile({ bucket: '@', key: 'spindle/a.txt' })
  })

  test('a grant cannot be escaped with a traversal through the granted folder', async () => {
    const service = scoped({ spindle: 'read' })
    for (const path of [
      '@spindle/../crm',
      '@spindle/%2e%2e/crm',
      '@spindle/library/../../crm',
    ]) {
      await assert.rejects(
        () => service.readFile({ bucket: path, key: 'a.txt' }),
        DENIED
      )
    }
    await assert.rejects(
      () => service.readFile({ bucket: '@spindle', key: '../crm/a.txt' }),
      DENIED
    )
    assert.deepEqual(calls, [])
  })

  test('a grant does not lift the signURL and copyFile refusals', async () => {
    const service = scoped({ spindle: 'write' })
    await assert.rejects(
      () => service.signURL({ url: 'https://x', dateLessThan: new Date() }),
      /not allowed/
    )
    await assert.rejects(
      () =>
        service.copyFile({
          bucket: '@spindle',
          key: 'a',
          fromAbsolutePath: '/etc/hosts',
        }),
      /not allowed/
    )
  })

  for (const prefix of [
    '',
    '/',
    '.',
    '..',
    '../spindle',
    '%2e%2e',
    'a/../..',
  ]) {
    test(`a grant on ${JSON.stringify(prefix)} is refused when the service is built`, () => {
      assert.throws(
        () => new ScopedContentService(fake, 'reports', { [prefix]: 'read' }),
        DENIED
      )
    })
  }

  test('a grant mode other than read or write is refused when the service is built', () => {
    assert.throws(
      () =>
        new ScopedContentService(fake, 'reports', {
          spindle: 'admin' as never,
        }),
      /must be 'read' or 'write'/
    )
  })

  test('an empty root is refused', () => {
    assert.throws(() => new ScopedContentService(fake, ''), DENIED)
    assert.throws(() => new ScopedContentService(fake, '..'), DENIED)
  })
})

const ADDON_PACKAGE = '@addon/example'

const parentWith = (content: ContentService) =>
  ({
    config: {},
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    content,
  }) as unknown as CoreSingletonServices

const registerAddon = (packageName = ADDON_PACKAGE) => {
  pikkuState(packageName, 'package', 'factories', {
    createSingletonServices: (async (_config: unknown, parent: any) => ({
      ...parent,
      contentSeenByAddon: parent.content,
    })) as never,
  })
}

const contentHandedTo = async (
  namespace: string,
  content: ContentService
): Promise<ContentService> => {
  const cfg = pikkuState(null, 'addons', 'packages').get(namespace)!
  const services = (await getOrCreatePackageSingletonServices(
    cfg.package,
    parentWith(content),
    { namespace, ...cfg } as never
  )) as any
  return services.contentSeenByAddon
}

describe('the host hands each wired addon a content service scoped to its folder', () => {
  let fake: ReturnType<typeof recordingContent>

  beforeEach(() => {
    resetPikkuState()
    fake = recordingContent()
    registerAddon()
  })

  test('the folder defaults to the wired name', async () => {
    wireAddon({ name: 'spindle', package: ADDON_PACKAGE })
    const content = await contentHandedTo('spindle', fake.service)
    await content.readFile({ bucket: 'library', key: 'a.txt' })
    assert.deepEqual(fake.calls, [
      { method: 'readFile', bucket: 'spindle/library', key: 'a.txt' },
    ])
  })

  test('contentBucket overrides the folder', async () => {
    wireAddon({
      name: 'spindle',
      package: ADDON_PACKAGE,
      contentBucket: 'media',
    })
    const content = await contentHandedTo('spindle', fake.service)
    await content.readFile({ bucket: 'library', key: 'a.txt' })
    assert.equal(fake.calls[0]?.bucket, 'media/library')
  })

  test("an addon cannot read another addon's folder, though both are wired", async () => {
    wireAddon({ name: 'spindle', package: ADDON_PACKAGE })
    wireAddon({ name: 'reports', package: ADDON_PACKAGE })
    const content = await contentHandedTo('reports', fake.service)
    await assert.rejects(
      () => content.readFile({ bucket: '@spindle/library', key: 'a.txt' }),
      DENIED
    )
    assert.deepEqual(fake.calls, [])
  })

  test('two instances of one package keep to their own folders', async () => {
    wireAddon({ name: 'one', package: ADDON_PACKAGE })
    wireAddon({ name: 'two', package: ADDON_PACKAGE })
    const one = await contentHandedTo('one', fake.service)
    const two = await contentHandedTo('two', fake.service)
    await one.writeFile({ bucket: 'b', key: 'k', stream: new ReadableStream() })
    await two.writeFile({ bucket: 'b', key: 'k', stream: new ReadableStream() })
    assert.deepEqual(
      fake.calls.map((c) => c.bucket),
      ['one/b', 'two/b']
    )
    await assert.rejects(
      () => one.readFile({ bucket: '@two/b', key: 'k' }),
      DENIED
    )
    await assert.rejects(
      () => two.deleteFile({ bucket: '@one/b', key: 'k' }),
      DENIED
    )
  })

  test('contentGrants from the wiring reach the addon', async () => {
    wireAddon({ name: 'spindle', package: ADDON_PACKAGE })
    wireAddon({
      name: 'reports',
      package: ADDON_PACKAGE,
      contentGrants: { spindle: 'read' },
    })
    const content = await contentHandedTo('reports', fake.service)
    await content.readFile({ bucket: '@spindle/library', key: 'a.txt' })
    await assert.rejects(
      () => content.deleteFile({ bucket: '@spindle/library', key: 'a.txt' }),
      DENIED
    )
    assert.deepEqual(fake.calls, [
      { method: 'readFile', bucket: 'spindle/library', key: 'a.txt' },
    ])
  })

  test('listing a dependency in uses grants none of its files', async () => {
    wireAddon({ name: 'spindle', package: ADDON_PACKAGE })
    wireAddon({
      name: 'reports',
      package: ADDON_PACKAGE,
      uses: { [ADDON_PACKAGE]: 'spindle' },
    })
    const content = await contentHandedTo('reports', fake.service)
    await assert.rejects(
      () => content.readFile({ bucket: '@spindle', key: 'a.txt' }),
      DENIED
    )
  })

  test('globalContent hands over the whole service', async () => {
    wireAddon({
      name: 'backup',
      package: ADDON_PACKAGE,
      globalContent: 'backs up every addon',
    })
    const content = await contentHandedTo('backup', fake.service)
    assert.equal(content, fake.service)
    await content.readFile({ bucket: 'anything', key: '../even-this' })
    assert.deepEqual(fake.calls, [
      { method: 'readFile', bucket: 'anything', key: '../even-this' },
    ])
  })

  test('an addon with no singleton factory is still scoped', async () => {
    resetPikkuState()
    wireAddon({ name: 'bare', package: '@addon/bare' })
    const cfg = pikkuState(null, 'addons', 'packages').get('bare')!
    const services = (await getOrCreatePackageSingletonServices(
      cfg.package,
      parentWith(fake.service),
      { namespace: 'bare', ...cfg } as never
    )) as any
    await services.content.readFile({ bucket: 'b', key: 'k' })
    assert.equal(fake.calls[0]?.bucket, 'bare/b')
    await assert.rejects(
      () => services.content.readFile({ bucket: '@other', key: 'k' }),
      DENIED
    )
  })

  test('with no addon instance the folder comes from the package name and never reaches past it', async () => {
    const services = (await getOrCreatePackageSingletonServices(
      ADDON_PACKAGE,
      parentWith(fake.service)
    )) as any
    await services.contentSeenByAddon.readFile({ bucket: 'b', key: 'k' })
    assert.equal(fake.calls[0]?.bucket, 'addon-example/b')
    await assert.rejects(
      () => services.contentSeenByAddon.readFile({ bucket: '../x', key: 'k' }),
      DENIED
    )
  })
})
