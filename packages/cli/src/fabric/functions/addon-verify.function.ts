import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { added, removed, dim } from '../lib/output.js'

const CheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
})
type Check = z.infer<typeof CheckSchema>

export const FabricAddonVerifyInput = z.object({
  dir: z.string().optional(),
})

export const FabricAddonVerifyOutputSchema = z.object({
  ok: z.boolean(),
  addonDir: z.string(),
  packageName: z.string().optional(),
  version: z.string().optional(),
  checks: z.array(CheckSchema),
})
export type FabricAddonVerifyOutput = z.infer<
  typeof FabricAddonVerifyOutputSchema
>

async function readJsonSafe<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

export const FabricAddonVerify = pikkuSessionlessFunc({
  description:
    'Verify an addon directory is correctly built and ready to publish',
  input: FabricAddonVerifyInput,
  output: FabricAddonVerifyOutputSchema,
  func: async (_services, { dir }) => {
    const addonDir = resolve(dir ?? process.cwd())
    const checks: Check[] = []

    const pass = (name: string, detail?: string): Check => ({
      name,
      ok: true,
      detail,
    })
    const fail = (name: string, detail: string): Check => ({
      name,
      ok: false,
      detail,
    })

    // 1. package.json
    const pkg = await readJsonSafe<{
      name?: string
      version?: string
      files?: string[]
    }>(join(addonDir, 'package.json'))
    if (!pkg) {
      checks.push(fail('package.json', 'not found'))
      return { ok: false, addonDir, checks }
    }
    checks.push(pass('package.json'))

    if (!pkg.name) checks.push(fail('package name', 'missing name field'))
    else checks.push(pass('package name', pkg.name))

    if (!pkg.version)
      checks.push(fail('package version', 'missing version field'))
    else checks.push(pass('package version', pkg.version))

    if (!pkg.files?.includes('dist')) {
      checks.push(fail('files field', 'must include "dist"'))
    } else {
      checks.push(pass('files field', '"dist" included'))
    }

    // 2. pikku.config.json with addon: true
    const pikkuConfig = await readJsonSafe<{ addon?: boolean }>(
      join(addonDir, 'pikku.config.json')
    )
    if (!pikkuConfig) {
      checks.push(fail('pikku.config.json', 'not found'))
    } else if (!pikkuConfig.addon) {
      checks.push(fail('pikku.config.json', 'addon: true not set'))
    } else {
      checks.push(pass('pikku.config.json', 'addon: true'))
    }

    // 3. dist/ built
    if (!existsSync(join(addonDir, 'dist'))) {
      checks.push(fail('dist/', 'not found — run build first'))
      return {
        ok: false,
        addonDir,
        packageName: pkg.name,
        version: pkg.version,
        checks,
      }
    }
    checks.push(pass('dist/'))

    // 4. dist/.pikku/ (generated metadata)
    const distPikku = join(addonDir, 'dist', '.pikku')
    if (!existsSync(distPikku)) {
      checks.push(
        fail(
          'dist/.pikku/',
          'missing — build script must run `cp -r .pikku dist/`'
        )
      )
      return {
        ok: false,
        addonDir,
        packageName: pkg.name,
        version: pkg.version,
        checks,
      }
    }
    checks.push(pass('dist/.pikku/'))

    // 5. At least one exported function
    const funcsMeta = await readJsonSafe<Record<string, unknown>>(
      join(distPikku, 'function', 'pikku-functions-meta.gen.json')
    )
    const funcCount = funcsMeta ? Object.keys(funcsMeta).length : 0
    if (funcCount === 0) {
      checks.push(
        fail(
          'functions',
          'no functions found in dist/.pikku/function/pikku-functions-meta.gen.json'
        )
      )
    } else {
      checks.push(
        pass(
          'functions',
          `${funcCount} function${funcCount === 1 ? '' : 's'} exported`
        )
      )
    }

    // 6. JSON schemas (advisory — addons without custom types have none)
    const schemasDir = join(distPikku, 'schemas', 'schemas')
    checks.push(
      pass('schemas dir', existsSync(schemasDir) ? 'present' : 'empty (ok)')
    )

    // 7. README
    if (!existsSync(join(addonDir, 'README.md'))) {
      checks.push(fail('README.md', 'missing'))
    } else {
      checks.push(pass('README.md'))
    }

    // 8. icon (advisory)
    const consoleMeta = await readJsonSafe<{ package?: { icon?: string } }>(
      join(distPikku, 'console', 'pikku-addon-meta.gen.json')
    )
    const icon = consoleMeta?.package?.icon
    if (!icon) {
      checks.push({ name: 'icon', ok: true, detail: 'none (optional)' })
    } else {
      checks.push(pass('icon', icon.slice(0, 40)))
    }

    const ok = checks.every((c) => c.ok)
    return { ok, addonDir, packageName: pkg.name, version: pkg.version, checks }
  },
})

export function renderAddonVerify(
  _s: unknown,
  result: FabricAddonVerifyOutput
): void {
  console.log(
    `\n${dim('Addon:')} ${result.packageName ?? '(unknown)'}@${result.version ?? '?'}`
  )
  console.log(`${dim('Dir:  ')} ${result.addonDir}\n`)
  for (const c of result.checks) {
    const icon = c.ok ? added('✓') : removed('✗')
    const label = c.ok ? c.name : removed(c.name)
    const detail = c.detail ? `  ${dim(c.detail)}` : ''
    console.log(`  ${icon} ${label}${detail}`)
  }
  console.log('')
  if (result.ok) {
    console.log(added('  Ready to publish.'))
  } else {
    console.log(removed('  Fix the errors above before publishing.'))
    process.exitCode = 1
  }
}
