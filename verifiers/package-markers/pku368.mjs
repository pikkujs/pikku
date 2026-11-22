/**
 * The negative half of the package-markers proof: the main package does not provide a
 * service an addon takes from its project, so `pikku all` at the root fails
 * with PKU368 naming the addon function and the service.
 *
 *   1. one addon needs `stamper`, a second (`mail`) needs `mailer`; the main package
 *      provides both and the root passes
 *   2. the main package stops providing `stamper`: PKU368 names tools:stamped
 *   3. a function of `tools` whose services are unknown must be blamed only
 *      for what `tools` takes from its project: with `mailer` missing, PKU368
 *      names mail:stamped and never tools:greet
 *
 * A separate script because the failing step is retried before it gives up
 * (about 40s), which `run.mjs` should not pay on every run. It works on a copy
 * of the fixture under `.negative/`, with its own node_modules links so every
 * addon is read from the copy, and removes it afterwards.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PIKKU = join(resolve(here, '../..'), 'packages/cli/dist/bin/pikku.js')
const copy = join(here, '.negative')
const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const pikku = (cwd, env = {}) =>
  spawnSync('node', [PIKKU, 'all'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })

const edit = (file, change) =>
  writeFileSync(file, change(readFileSync(file, 'utf8')))
const without = (file, service) =>
  edit(file, (text) => text.replace(new RegExp(`^.*${service}:.*\\n`, 'm'), ''))

try {
  rmSync(copy, { recursive: true, force: true })
  const skip = (src) => !/\/(\.pikku|node_modules)(\/|$)/.test(src)
  for (const file of ['pikku.config.json', 'tsconfig.json', 'package.json']) {
    cpSync(join(here, file), join(copy, file))
  }
  cpSync(join(here, 'packages'), join(copy, 'packages'), {
    recursive: true,
    filter: skip,
  })

  // A second addon, `mail`: the first one with `stamper` renamed `mailer`. The
  // workspace finds it by its marker; nothing lists it.
  const mail = join(copy, 'packages/mail')
  cpSync(join(copy, 'packages/tools'), mail, { recursive: true })
  for (const file of [
    'package.json',
    'pikku.config.json',
    'src/services.ts',
    'src/functions/greet.functions.ts',
    'types/application-types.d.ts',
  ]) {
    edit(join(mail, file), (text) =>
      text
        .replaceAll('verifier-ba-tools', 'verifier-ba-mail')
        .replaceAll('"namespace": "tools"', '"namespace": "mail"')
        .replaceAll('stamper', 'mailer')
    )
  }

  // The main package wires and calls both, and provides both services.
  const app = join(copy, 'packages/app')
  edit(join(app, 'src/app.wiring.ts'), (text) =>
    text
      .replace(
        "wireHTTP({ method: 'get', route: '/ping'",
        `wireAddon({ name: 'mail', package: '@pikku/verifier-ba-mail' })\n\nwireHTTP({ method: 'get', route: '/mail', func: mailVia, auth: false })\n\nwireHTTP({ method: 'get', route: '/ping'`
      )
      .replace('import { greetVia,', 'import { greetVia, mailVia,')
  )
  edit(
    join(app, 'src/functions/app.functions.ts'),
    (text) =>
      `${text}
export const mailVia = pikkuSessionlessFunc<{ text: string }, { text: string }>({
  auth: false,
  func: async (_services, { text }, { rpc }) =>
    rpc.invoke('mail:stamped', { text }),
})
`
  )
  edit(join(app, 'src/services.ts'), (text) =>
    text.replace(
      /^(.*)stamper:.*\n/m,
      (line) => `${line}${line.replace('stamper', 'mailer')}`
    )
  )
  edit(join(app, 'types/application-types.d.ts'), (text) =>
    text.replace(
      /^(.*)stamper:.*\n/m,
      (line) => `${line}${line.replace('stamper', 'mailer')}`
    )
  )

  // Every package resolves to the copy, never to the original fixture.
  const links = join(copy, 'node_modules/@pikku')
  mkdirSync(links, { recursive: true })
  const repo = resolve(here, '../..')
  symlinkSync(join(repo, 'packages/cli'), join(links, 'cli'))
  symlinkSync(join(repo, 'packages/core'), join(links, 'core'))
  for (const [name, dir] of [
    ['verifier-ba-app', 'app'],
    ['verifier-ba-tools', 'tools'],
    ['verifier-ba-mail', 'mail'],
  ]) {
    symlinkSync(join(copy, 'packages', dir), join(links, name))
  }

  const run1 = pikku(copy)
  if (run1.status !== 0) {
    console.error(run1.stdout + run1.stderr)
    fail('pikku all failed although the main package provides every service')
  }
  console.log('✓ two addons whose services the main package provides pass')

  // The main package stops providing `stamper`.
  const services = join(app, 'src/services.ts')
  const types = join(app, 'types/application-types.d.ts')
  const keep = [readFileSync(services, 'utf8'), readFileSync(types, 'utf8')]
  without(services, 'stamper')
  without(types, 'stamper')
  const run2 = pikku(copy)
  const output2 = run2.stdout + run2.stderr
  if (run2.status === 0)
    fail('pikku all passed although the main package lacks `stamper`')
  if (!/PKU368/.test(output2)) {
    console.error(output2)
    fail('pikku all failed, but not with PKU368')
  }
  if (!/'tools:stamped'.*'stamper'/.test(output2)) {
    console.error(output2)
    fail('PKU368 does not name tools:stamped and stamper')
  }
  console.log('✓ a service the main package does not provide is refused (PKU368)')

  // `tools:greet` has unknown services, and `mailer`, which only `mail`
  // takes, is missing. The addon passes are skipped (PIKKU_DEPLOY_CODEGEN) so
  // the edited metadata is what the root reads.
  writeFileSync(services, keep[0])
  writeFileSync(types, keep[1])
  without(services, 'mailer')
  without(types, 'mailer')
  for (const name of ['pikku-functions-meta', 'pikku-functions-meta-verbose']) {
    const metaFile = join(
      copy,
      `packages/tools/.pikku/addon/function/${name}.gen.json`
    )
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
    meta.greet.services.services = null
    writeFileSync(metaFile, JSON.stringify(meta))
  }
  const run3 = pikku(copy, { PIKKU_DEPLOY_CODEGEN: '1' })
  const output3 = run3.stdout + run3.stderr
  if (!/'mail:stamped'.*'mailer'/.test(output3)) {
    console.error(output3)
    fail('PKU368 does not name mail:stamped and mailer')
  }
  if (/'tools:greet'/.test(output3)) {
    console.error(output3)
    fail('tools:greet is blamed for a service only mail takes')
  }
  console.log(
    '✓ a function with unknown services is blamed for its own addon only'
  )
} finally {
  rmSync(copy, { recursive: true, force: true })
}
