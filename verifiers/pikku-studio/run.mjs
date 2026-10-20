/**
 * An addon declaring its Studio screens with pikkuStudio.
 *
 *   1. pikku all             → passes, and the screens meta carries every
 *                              field as written (scope, nav, badge, needsApp,
 *                              layout, replaces, scopes)
 *   2. messages/de.json      → lacks a title key: a warning, not a failure
 *   3. a non-literal field   → PKU345, the inspector reads screens statically
 *   4. a path used twice     → PKU357
 *   5. a title key missing
 *      from messages/en.json → PKU358
 *   6. a badge naming no
 *      function of the addon → PKU359
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const screensPath = join(here, 'src', 'screens.ts')
const enPath = join(here, 'messages', 'en.json')

class CheckFailed extends Error {}

/** Throws rather than exits, so withFile puts an edited fixture back first. */
const fail = (message, output) => {
  if (output) console.error(output)
  console.error(`✗ ${message}`)
  throw new CheckFailed(message)
}

process.on('uncaughtException', (error) => {
  if (!(error instanceof CheckFailed)) console.error(error)
  process.exit(1)
})

const pikkuAll = () => {
  const result = spawnSync('node', [PIKKU, 'all'], {
    cwd: here,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const withFile = (path, edit, check) => {
  const original = readFileSync(path, 'utf8')
  try {
    const edited = edit(original)
    if (edited === original) fail(`the edit to ${path} changed nothing`)
    writeFileSync(path, edited)
    check()
  } finally {
    writeFileSync(path, original)
  }
}

const expectFailure = (code, message) => {
  const result = pikkuAll()
  if (result.status === 0 || !result.output.includes(code)) {
    fail(message, result.output)
  }
}

const ok = pikkuAll()
if (ok.status !== 0) fail('pikku all failed on a valid pikkuStudio', ok.output)

const metaPath = join(
  here,
  '.pikku',
  'addon',
  'screens',
  'pikku-screens-meta.gen.json'
)
if (!existsSync(metaPath))
  fail(`pikku all wrote no screens meta at ${metaPath}`)
const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
const expected = {
  title: 'studio_verifier__title',
  screens: [
    {
      path: '/studio-verifier',
      title: 'studio_verifier_inbox__title',
      scope: 'project',
      nav: { area: 'project', icon: 'inbox', order: 10, badge: 'pendingCount' },
      needsApp: true,
      scopes: ['studio-verifier:read'],
      component: './screens/Inbox.js',
    },
    {
      path: '/studio-verifier/settings',
      title: 'studio_verifier_settings__title',
      scope: 'team',
      nav: { area: 'team', icon: 'settings', order: 20 },
      layout: 'bare',
      replaces: true,
      component: './screens/Settings.js',
    },
    {
      path: '/studio-verifier/console',
      title: 'studio_verifier_console__title',
      scope: 'studio',
      app: 'console',
    },
  ],
}
const sortKeys = (value) =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sortKeys(value[key])])
        )
      : value
const strip = (manifest) =>
  sortKeys({
    title: manifest.title,
    screens: manifest.screens.map(({ sourceFile, ...screen }) => screen),
  })
if (JSON.stringify(strip(meta)) !== JSON.stringify(sortKeys(expected))) {
  fail(
    'the screens meta does not carry the screens as written',
    JSON.stringify(meta, null, 2)
  )
}
console.log('✓ pikku all passes and the screens meta carries every field')

if (
  !ok.output.includes('studio_verifier_console__title') ||
  !ok.output.includes('de.json')
) {
  fail('no warning for the title key messages/de.json lacks', ok.output)
}
console.log('✓ a key missing from another locale is a warning')

withFile(
  screensPath,
  (text) => text.replace("icon: 'inbox',", "icon: ['in', 'box'].join(''),"),
  () => expectFailure('PKU345', 'a non-literal nav icon built')
)
console.log('✓ a non-literal field fails with PKU345')

withFile(
  screensPath,
  (text) =>
    text.replace(
      "path: '/studio-verifier/console',",
      "path: '/studio-verifier',"
    ),
  () => expectFailure('PKU357', 'a path used twice built')
)
console.log('✓ a duplicate path fails with PKU357')

withFile(
  enPath,
  (text) =>
    text.replace('  "studio_verifier_settings__title": "Settings",\n', ''),
  () => expectFailure('PKU358', 'a title key missing from en.json built')
)
console.log('✓ a title key missing from messages/en.json fails with PKU358')

withFile(
  screensPath,
  (text) => text.replace("badge: 'pendingCount'", "badge: 'unreadCount'"),
  () => expectFailure('PKU359', 'a badge naming no function built')
)
console.log('✓ a badge naming no function fails with PKU359')
