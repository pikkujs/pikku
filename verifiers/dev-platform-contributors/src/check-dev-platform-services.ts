import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HostMailService } from '@verifier/host-mail/service'
import { AuditLog } from './audit-log.js'
import { createPlatformServices } from '../.pikku/pikku-dev-platform-services.gen.js'

const source = readFileSync(
  new URL('../.pikku/pikku-dev-platform-services.gen.ts', import.meta.url),
  'utf8'
)

assert.doesNotMatch(source, /file:/)
assert.match(source, /from "@verifier\/host-mail\/service"/)
assert.match(source, /from "\.\.\/src\/audit-log\.js"/)

const withMail = await createPlatformServices({
  HOST_MAIL_URL: 'http://mail.test',
  HOST_MAIL_TOKEN: 'token',
})
assert.ok(withMail.emailService instanceof HostMailService)
assert.deepEqual(await withMail.emailService.send({ to: 'a', subject: 'b' }), {
  id: 'http://mail.test:a:b',
})
assert.ok(withMail.auditLog instanceof AuditLog)
assert.deepEqual(withMail.auditLog.entries, ['dev:boot'])

const withoutMail = await createPlatformServices({})
assert.equal(withoutMail.emailService, undefined)

console.log('dev platform services: imports resolve, typecheck and load')
