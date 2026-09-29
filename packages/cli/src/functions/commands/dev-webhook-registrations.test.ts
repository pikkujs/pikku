import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, test } from 'node:test'
import { addFunction } from '@pikku/core/function'
import { LocalCredentialService } from '@pikku/core/services'
import { pikkuState, resetPikkuState } from '@pikku/core/state'

import {
  WEBHOOK_REGISTRATIONS_FILE,
  gitEnv,
  reconcileDevWebhooks,
} from './dev-webhook-registrations.js'

const env = {
  PIKKU_DEV_WEBHOOK_URL: 'https://dev.test',
  PIKKU_DEV_WEBHOOK_LABEL_PREFIX: 'dev-sam',
}

const git = (dir: string, args: string[]) =>
  spawnSync('git', args, { cwd: dir, env: gitEnv() })

const gitDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-webhooks-'))
  git(dir, ['init', '-q'])
  return dir
}

const recordingLogger = () => {
  const lines: string[] = []
  const push = (message: string) => lines.push(message)
  return {
    lines,
    logger: { info: push, warn: push, error: push, debug: () => {} } as any,
  }
}

let setups = 0
let credentialService: LocalCredentialService

beforeEach(() => {
  resetPikkuState()
  setups = 0
  credentialService = new LocalCredentialService()
  pikkuState(null, 'package', 'credentialsMeta', {
    shopWebhookSecret: {
      name: 'shopWebhookSecret',
      displayName: 'Shop signing secret',
      type: 'singleton',
    },
  })
  ;(pikkuState(null, 'trigger', 'webhookSourceMeta') as any).shop = {
    name: 'shop',
    method: 'post',
    route: '/webhooks/shop',
    events: [],
    setup: 'shop:setup',
  }
  addFunction('shop:setup', {
    func: async ({ credentialService }: any) => {
      setups++
      await credentialService.set('shopWebhookSecret', 'whsec_1')
      return { status: 'created', state: { id: 'we_1' } }
    },
  } as never)
  pikkuState(null, 'function', 'meta')['shop:setup'] = {
    name: 'shop:setup',
    sessionless: true,
    permissions: [],
  } as never
})

const reconcile = (configDir: string, logger: any, extraEnv = {}) =>
  reconcileDevWebhooks({
    configDir,
    logger,
    singletonServices: { logger, credentialService } as any,
    env: { ...env, ...extraEnv },
  })

test('registers once, ignores the file in git and keeps it private', async () => {
  const dir = gitDir()
  const { logger } = recordingLogger()

  await reconcile(dir, logger)
  await reconcile(dir, logger)

  assert.equal(setups, 1)
  const file = join(dir, WEBHOOK_REGISTRATIONS_FILE)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8'))['dev-sam'].shop, {
    url: 'https://dev.test/webhooks/shop',
    events: [],
    status: 'created',
    state: { id: 'we_1' },
    credentials: { shopWebhookSecret: 'whsec_1' },
  })
  assert.match(
    readFileSync(join(dir, '.gitignore'), 'utf8'),
    /^\.webhook-registrations\.gen\.json$/m
  )
})

test('refuses to write the file when git tracks it', async () => {
  const dir = gitDir()
  writeFileSync(join(dir, WEBHOOK_REGISTRATIONS_FILE), '{}\n')
  git(dir, ['add', WEBHOOK_REGISTRATIONS_FILE])
  const { logger, lines } = recordingLogger()

  await reconcile(dir, logger)

  assert.equal(setups, 0)
  assert.equal(
    readFileSync(join(dir, WEBHOOK_REGISTRATIONS_FILE), 'utf8'),
    '{}\n'
  )
  assert.match(lines[0]!, /tracked by git/)
})

test('does nothing without a public url', async () => {
  const dir = gitDir()
  const { logger, lines } = recordingLogger()

  await reconcile(dir, logger, { PIKKU_DEV_WEBHOOK_URL: '' })

  assert.equal(setups, 0)
  assert.match(lines[0]!, /PIKKU_DEV_WEBHOOK_URL/)
})

test('warns about a registration no source declares, every run', async () => {
  const dir = gitDir()
  writeFileSync(
    join(dir, WEBHOOK_REGISTRATIONS_FILE),
    JSON.stringify({
      'dev-sam': {
        gone: {
          url: 'https://dev.test/webhooks/gone',
          events: [],
          status: 'created',
        },
      },
    })
  )
  const { logger, lines } = recordingLogger()

  await reconcile(dir, logger)
  await reconcile(dir, logger)

  const warnings = lines.filter((line) => line.includes("'gone'"))
  assert.equal(warnings.length, 2)
  assert.match(
    warnings[0]!,
    /https:\/\/dev\.test\/webhooks\/gone \(label dev-sam:gone\)/
  )
})
