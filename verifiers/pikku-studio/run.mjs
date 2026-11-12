/**
 * An addon declaring its Studio screens with definePlugin.
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
 *   7. a screen agent        → recorded with its frontmatter keys, and
 *                              defaultChat: false is carried into the meta
 *   8. an invalid agent      → PKU365, and only PKU365
 *   9. package.json "files"  → PKU366 when it leaves out agents/ (for a valid
 *                              agent) or skills/ (when skills/<x>/SKILL.md
 *                              exists); passes when it covers them, or when
 *                              there is no "files" at all
 *  10. pikku new addon --ui  → package.json carries the studio block and
 *                              ships agents and skills
 *  11. widgets, things and
 *      arranged screens      → reach the meta as written, project RPC
 *                              sources and destructive actions included
 *  12. #pikku/addon/screens  → definePlugin typed against the addon's
 *                              functions and message keys: the fixture passes
 *                              tsc, and a slot `from` naming no key of its
 *                              source's output, or an unknown message key,
 *                              fails tsc
 *  13. a slot copy key
 *      missing from en.json  → PKU358
 *  14. a destructive action
 *      without confirm, or a
 *      malformed RPC name    → PKU345
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')
const screensPath = join(here, 'src', 'screens.ts')
const enPath = join(here, 'messages', 'en.json')
const packagePath = join(here, 'package.json')

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
if (ok.status !== 0) fail('pikku all failed on a valid definePlugin', ok.output)

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
      agent: 'helper',
      defaultChat: false,
      agentTitle: 'studio_verifier_agent__title',
      agentDescription: 'studio_verifier_agent__description',
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

const health = meta.arrangedScreens?.find((screen) => screen.id === 'health')
if (
  health?.path !== '/studio-verifier/health-next' ||
  health.source !== 'healthScreen' ||
  JSON.stringify(health.poll) !== JSON.stringify({ fast: 3000, slow: 45000 }) ||
  JSON.stringify(health.shows) !== JSON.stringify(['meta']) ||
  health.slots?.[0]?.copy?.wrong?.headline !==
    'studio_verifier_verdict_wrong__headline' ||
  health.slots?.[1]?.own !== true
) {
  fail(
    'the arranged screen is not in the meta as written',
    JSON.stringify(meta.arrangedScreens, null, 2)
  )
}
const thing = meta.things?.find((entry) => entry.kind === 'meta')
const forget = thing?.actions?.find((action) => action.id === 'forget')
if (
  thing?.source !== 'console:getAllMeta' ||
  forget?.run !== 'admin:flagPrune' ||
  forget.destructive !== true ||
  forget.confirm !== 'studio_verifier_forget__confirm'
) {
  fail('the thing is not in the meta as written', JSON.stringify(meta.things))
}
const mini = meta.widgets?.find((widget) => widget.id === 'mini')
if (mini?.component !== './widgets/Mini.js') {
  fail('the widget is not in the meta as written', JSON.stringify(meta.widgets))
}
console.log(
  '✓ widgets, things and arranged screens reach the meta, project RPC sources and destructive actions included'
)

const pluginTypesPath = join(
  here,
  '.pikku',
  'addon',
  'screens',
  'pikku-plugin-types.gen.ts'
)
const pluginTypes = existsSync(pluginTypesPath)
  ? readFileSync(pluginTypesPath, 'utf8')
  : ''
if (
  !pluginTypes.includes('import type { RPCMap }') ||
  !pluginTypes.includes('"studio_verifier_health__title"')
) {
  fail('#pikku/addon/screens does not type definePlugin', pluginTypes)
}
const tsc = () => {
  const result = spawnSync(TSC, ['--noEmit', '-p', 'tsconfig.json'], {
    cwd: here,
    encoding: 'utf8',
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const typed = tsc()
if (typed.status !== 0) fail('the fixture does not pass tsc', typed.output)
const expectTscFailure = (needle, message) => {
  const result = tsc()
  if (result.status === 0 || !result.output.includes(needle)) {
    fail(message, result.output)
  }
}
withFile(
  screensPath,
  (text) =>
    text.replace(
      "{ widget: 'mini', from: 'pending',",
      "{ widget: 'mini', from: 'pendng',"
    ),
  () =>
    expectTscFailure(
      'src/screens.ts',
      'a slot from naming no key of the source output passed tsc'
    )
)
withFile(
  screensPath,
  (text) =>
    text.replace(
      "title: 'studio_verifier_health__title',",
      "title: 'studio_verifier_health__titel',"
    ),
  () => expectTscFailure('src/screens.ts', 'an unknown message key passed tsc')
)
console.log(
  '✓ #pikku/addon/screens types definePlugin: a wrong from or an unknown key fails tsc'
)

withFile(
  enPath,
  (text) =>
    text.replace(
      '  "studio_verifier_verdict_wrong__headline": "{count} things went wrong",\n',
      ''
    ),
  () => expectFailure('PKU358', 'a slot copy key missing from en.json built')
)
console.log('✓ a slot copy key missing from messages/en.json fails with PKU358')

withFile(
  screensPath,
  (text) =>
    text.replace("          confirm: 'studio_verifier_forget__confirm',\n", ''),
  () => expectFailure('PKU345', 'a destructive action without confirm built')
)
withFile(
  screensPath,
  (text) => text.replace("'admin:flagPrune'", "'Admin::flagPrune'"),
  () => expectFailure('PKU345', 'a malformed project RPC name built')
)
console.log(
  '✓ a destructive action without confirm, or a malformed RPC name, fails with PKU345'
)

const inbox = meta.screens.find((screen) => screen.path === '/studio-verifier')
if (inbox?.defaultChat !== false) {
  fail('defaultChat: false is not in the screens meta', JSON.stringify(inbox))
}
const quiet = meta.screens.filter(
  (screen) => screen.path !== '/studio-verifier'
)
if (quiet.some((screen) => 'defaultChat' in screen)) {
  fail('a screen that did not declare defaultChat has one in the meta')
}
console.log(
  '✓ a screen agent is recorded, and defaultChat: false reaches the meta (an undeclared one does not)'
)

withFile(
  screensPath,
  (text) => text.replace("agent: 'helper',", "agent: 'Not_A_Name',"),
  () =>
    withPackageFiles(['dist', 'messages'], () => {
      const result = pikkuAll()
      if (result.status === 0 || !result.output.includes('PKU365')) {
        fail('an invalid agent built', result.output)
      }
      if (result.output.includes('PKU366')) {
        fail('an invalid agent also drew PKU366', result.output)
      }
    })
)
console.log('✓ an invalid agent fails with PKU365, and only PKU365')

/** Sets package.json "files" for the length of the check. */
function withPackageFiles(files, check) {
  withFile(
    packagePath,
    (text) => {
      const pkg = JSON.parse(text)
      pkg.files = files
      return `${JSON.stringify(pkg, null, 2)}\n`
    },
    check
  )
}

const withSkill = (check) => {
  const dir = join(here, 'skills', 'inbox-triage')
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(join(dir, 'SKILL.md'), '# Inbox triage\n')
    check()
  } finally {
    rmSync(join(here, 'skills'), { recursive: true, force: true })
  }
}

const expectPasses = (message) => {
  const result = pikkuAll()
  if (result.status !== 0 || result.output.includes('PKU366')) {
    fail(message, result.output)
  }
}

withPackageFiles(['dist', 'messages'], () =>
  expectFailure(
    'does not list agents/',
    'a "files" list without agents/ built with a screen agent'
  )
)
console.log('✓ "files" without agents/ fails with PKU366 for a valid agent')

withPackageFiles(['dist', 'messages', 'agents'], () =>
  withSkill(() =>
    expectFailure(
      'does not list it; add "skills" to it so the published addon ships its skills',
      'a "files" list without skills/ built with skills/<x>/SKILL.md present'
    )
  )
)
console.log(
  '✓ "files" without skills/ fails with PKU366 when the addon has skills'
)

withPackageFiles(['dist', 'messages', 'agents/', 'skills/**'], () =>
  withSkill(() => expectPasses('"files" covering agents/ and skills/ failed'))
)
if ('files' in JSON.parse(readFileSync(packagePath, 'utf8'))) {
  fail('the verifier package.json must have no "files" for this check')
}
withSkill(() => expectPasses('a package with no "files" failed'))
console.log('✓ no PKU366 when "files" covers agents/ and skills/, or is absent')

const scaffoldRoot = mkdtempSync(join(tmpdir(), 'pikku-studio-scaffold-'))
try {
  const scaffold = spawnSync(
    'node',
    [
      PIKKU,
      'new',
      'addon',
      'inbox-kit',
      '--ui',
      '--dir',
      scaffoldRoot,
      '--build',
      'false',
    ],
    { cwd: here, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } }
  )
  if (scaffold.status !== 0) {
    fail(
      `pikku new addon --ui exited with ${scaffold.status}`,
      `${scaffold.stdout}${scaffold.stderr}`
    )
  }
  const scaffoldPkg = join(scaffoldRoot, 'addon-inbox-kit', 'package.json')
  if (!existsSync(scaffoldPkg)) {
    fail(
      'pikku new addon --ui wrote no package.json',
      `${scaffold.stdout}${scaffold.stderr}`
    )
  }
  const pkg = JSON.parse(readFileSync(scaffoldPkg, 'utf8'))
  const studio = JSON.stringify(pkg.studio)
  const want = JSON.stringify({
    addon: 'inbox-kit',
    ui: './src',
    messages: './messages/{locale}.json',
  })
  if (studio !== want)
    fail(`the scaffold's studio block is ${studio}, not ${want}`)
  for (const dir of ['agents', 'skills']) {
    if (!pkg.files?.includes(dir)) {
      fail(
        `the scaffold's "files" leaves out ${dir}: ${JSON.stringify(pkg.files)}`
      )
    }
  }
} finally {
  rmSync(scaffoldRoot, { recursive: true, force: true })
}
console.log(
  '✓ pikku new addon --ui writes the studio block and ships agents and skills'
)
