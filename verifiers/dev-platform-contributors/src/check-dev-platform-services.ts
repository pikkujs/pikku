import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HostMailService } from '@verifier/host-mail/service'
import { AuditLog } from './audit-log.js'
import { LogSource } from '@verifier/log-addon/log-source'
import { createPlatformServices } from '../.pikku/pikku-dev-platform-services.gen.js'

const source = readFileSync(
  new URL('../.pikku/pikku-dev-platform-services.gen.ts', import.meta.url),
  'utf8'
)

assert.doesNotMatch(source, /file:/)
assert.match(source, /from "@verifier\/host-mail\/service"/)
assert.match(source, /from "\.\.\/src\/audit-log\.js"/)
assert.match(source, /from "@verifier\/log-addon\/log-source"/)

const order = [
  'services.auditLog =',
  'services.logSources =',
  'services.logReader =',
]
const positions = order.map((line) => source.indexOf(line))
assert.ok(
  positions.every((at, i) => at >= 0 && (i === 0 || at > positions[i - 1]!)),
  `contributors must run in needs/provides order: ${order.join(' -> ')}`
)

const runtimeLogger = { name: 'runtime-logger' }
const withMail = await createPlatformServices(
  {
    HOST_MAIL_URL: 'http://mail.test',
    HOST_MAIL_TOKEN: 'token',
  },
  { logger: runtimeLogger }
)
assert.ok(withMail.emailService instanceof HostMailService)
assert.deepEqual(await withMail.emailService.send({ to: 'a', subject: 'b' }), {
  id: 'http://mail.test:a:b',
})
assert.ok(withMail.auditLog instanceof AuditLog)
assert.deepEqual(withMail.auditLog.entries, ['dev:boot'])
assert.ok(withMail.logSources.workspace instanceof LogSource)
assert.equal(withMail.logSources.workspace.label, 'dev')
assert.strictEqual(withMail.logSources.workspace.logger, runtimeLogger)
assert.strictEqual(withMail.logReader, withMail.logSources.workspace)

const withoutMail = await createPlatformServices({})
assert.equal(withoutMail.emailService, undefined)

console.log(
  'dev platform services: imports resolve, typecheck, load, and run in needs/provides order with the addon contributor'
)
