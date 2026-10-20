/**
 * Registry pack/install round-trip verifier (shadcn / yarn-workspace model).
 *
 * Mirrors `pikku cloud addon publish` (npm pack) and `pikku cloud addon add`
 * (copy source into addons/<name>, register a yarn workspace, record
 * provenance). The addon lands in the consumer's own tree — editable,
 * shadcn-style — and a node_modules symlink (exactly what `yarn install` makes
 * for a workspace member) lets `wireAddon({ package })` resolve it by name.
 * addons/ sits outside the consumer's tsconfig/pikku scan, so it never collides
 * with the app's own CoreConfig.
 *   0. a cast around pikkuAddonServices(...) fails pikku all with PKU564
 *   1. pikku all on the source addon
 *   1b. tsc --noEmit on the source                        (node category narrowing,
 *       and pikku-package.gen.ts for an addon Config/services core's types reject)
 *   2. npm pack the addon → tgz                           (publish artifact)
 *   3. copy into consumer/addons/<name> (strip 1)         (add: shadcn copy)
 *   3b. symlink node_modules/<pkg> → addons/<name>        (yarn workspace link)
 *       + write pikku-addons.json                         (add: provenance)
 *   4. pikku all + tsc --noEmit in the consumer
 *   5. invoke consumeHello → rpc.invoke('ext:hello') and assert the result
 *   6. POST /webhooks/ext → the addon's receive → the consumer's ext:ping.sent
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const sourceDir = join(here, 'source')
const consumerDir = join(here, 'consumer')

const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')
const TSX = join(repoRoot, 'node_modules/.bin/tsx')
const ADDON_PKG = '@pikku/verifier-registry-addon'
const ADDON_FOLDER = ADDON_PKG.split('/').pop()

function run(label, file, args, cwd) {
  console.log(`\n▶ ${label}`)
  console.log(
    `  ${file} ${args.join(' ')}  (cwd: ${cwd.replace(repoRoot, '.')})`
  )
  execFileSync(file, args, { cwd, stdio: 'inherit' })
}

function capture(file, args, cwd) {
  return execFileSync(file, args, { cwd, encoding: 'utf8' })
}

// 0. A cast around the services factory hides it from the inspector: the
// addon would build without registering it, and fail at runtime. It must fail
// the build instead, naming the export and its line.
{
  const servicesPath = join(sourceDir, 'src', 'services.ts')
  const original = readFileSync(servicesPath, 'utf8')
  let result
  try {
    writeFileSync(
      servicesPath,
      original.replace(
        /\n\)\n$/,
        '\n) as unknown as typeof pikkuAddonServices\n'
      )
    )
    result = spawnSync('node', [PIKKU, 'all'], {
      cwd: sourceDir,
      encoding: 'utf8',
    })
  } finally {
    writeFileSync(servicesPath, original)
  }
  const output = `${result.stdout}${result.stderr}`
  const expected =
    /\[PKU564\].*'createSingletonServices' at src\/services\.ts:4 wraps pikkuAddonServices\(\.\.\.\) in an `as` cast/
  if (result.status === 0 || !expected.test(output)) {
    console.error(output)
    throw new Error(
      'a cast around pikkuAddonServices(...) did not fail pikku all with PKU564'
    )
  }
  console.log(
    '✓ a cast around pikkuAddonServices(...) fails the build (PKU564)'
  )
}

// 1. Build the source addon
run('source: pikku all', 'node', [PIKKU, 'all'], sourceDir)

// 1b. Type-check the source too. The addon declares `categories`, so this is
// where `NodeConfig`'s narrowing is proved — type-tests/node-category.assert.ts
// expects an undeclared category to be an error. It is also where the generated
// pikku-package.gen.ts registers a factory whose Config has a required field of
// its own and whose services narrow a core one (types/application-types.d.ts).
run('source: tsc --noEmit', TSC, ['--noEmit', '-p', 'tsconfig.json'], sourceDir)

// 2. Pack the addon — npm pack respects the `files` field (src + types + .pikku)
console.log('\n▶ source: npm pack')
const packOut = capture('npm', ['pack', '--json'], sourceDir)
const tgzName = JSON.parse(packOut)[0].filename
const tgzPath = join(sourceDir, tgzName)
if (!existsSync(tgzPath)) {
  throw new Error(`npm pack did not produce ${tgzPath}`)
}
console.log(`  packed → ${tgzName}`)

// 3. add (shadcn copy): extract the artifact into consumer/addons/<name>
const installDir = join(consumerDir, 'addons', ADDON_FOLDER)
rmSync(installDir, { recursive: true, force: true })
mkdirSync(installDir, { recursive: true })
run(
  'consumer: copy addon into addons/',
  'tar',
  ['-xzf', tgzPath, '-C', installDir, '--strip-components=1'],
  consumerDir
)
console.log(`  addon files: ${readdirSync(installDir).join(', ')}`)

// 3b. yarn-workspace link: symlink node_modules/<pkg> → addons/<name> (the exact
//     symlink `yarn install` creates for a workspace member), and record install
//     provenance the way `pikku cloud addon add` does. Must happen before
//     `pikku all` so the inspector resolves the addon's functions meta.
const linkPath = join(consumerDir, 'node_modules', ...ADDON_PKG.split('/'))
rmSync(linkPath, { recursive: true, force: true })
mkdirSync(dirname(linkPath), { recursive: true })
symlinkSync(relative(dirname(linkPath), installDir), linkPath, 'dir')
console.log(`  linked node_modules/${ADDON_PKG} → addons/${ADDON_FOLDER}`)

const version = JSON.parse(
  readFileSync(join(installDir, 'package.json'), 'utf8')
).version
writeFileSync(
  join(consumerDir, 'pikku-addons.json'),
  JSON.stringify({ [ADDON_PKG]: { id: ADDON_PKG, version } }, null, 2) + '\n'
)
console.log(`  recorded pikku-addons.json (${ADDON_PKG}@${version})`)

// 4. Build + type-check the consumer against the linked addon
rmSync(join(consumerDir, '.pikku'), { recursive: true, force: true })
run('consumer: pikku all', 'node', [PIKKU, 'all'], consumerDir)
run(
  'consumer: tsc --noEmit',
  TSC,
  ['--noEmit', '-p', 'tsconfig.json'],
  consumerDir
)

// 5. Runtime invoke — prove the installed addon actually runs over RPC
run('consumer: runtime invoke', TSX, ['src/start.ts'], consumerDir)

// 6. The addon's webhook source, mounted by the consumer at /webhooks/ext
run('consumer: addon webhook source', TSX, ['src/webhook.ts'], consumerDir)

// Cleanup the artifact (keep addons/ install + symlink for debugging)
rmSync(tgzPath, { force: true })

console.log(
  '\n✓ registry pack/install round-trip passed (shadcn/workspace model)'
)
