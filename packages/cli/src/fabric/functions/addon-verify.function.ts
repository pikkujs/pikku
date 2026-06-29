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

type JsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'missing' | 'invalid' }

async function readJsonSafe<T>(path: string): Promise<JsonResult<T>> {
  if (!existsSync(path)) return { ok: false, reason: 'missing' }
  try {
    return { ok: true, value: JSON.parse(await readFile(path, 'utf8')) as T }
  } catch {
    return { ok: false, reason: 'invalid' }
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

    const pkgResult = await readJsonSafe<{
      name?: string
      version?: string
      files?: string[]
    }>(join(addonDir, 'package.json'))
    if (!pkgResult.ok) {
      checks.push(
        fail(
          'package.json',
          pkgResult.reason === 'missing' ? 'not found' : 'invalid JSON'
        )
      )
      return { ok: false, addonDir, checks }
    }
    checks.push(pass('package.json'))
    const pkg = pkgResult.value

    if (!pkg.name) checks.push(fail('package name', 'missing name field'))
    else checks.push(pass('package name', pkg.name))

    if (!pkg.version)
      checks.push(fail('package version', 'missing version field'))
    else checks.push(pass('package version', pkg.version))

    const hasDistInFiles = pkg.files?.some(
      (f) => f === 'dist' || f === 'dist/' || f.startsWith('dist/')
    )
    if (!hasDistInFiles) {
      checks.push(
        fail('files field', 'must include "dist" (or "dist/", "dist/**/*")')
      )
    } else {
      checks.push(pass('files field', '"dist" included'))
    }

    const pikkuConfigResult = await readJsonSafe<{ addon?: boolean }>(
      join(addonDir, 'pikku.config.json')
    )
    if (!pikkuConfigResult.ok) {
      checks.push(
        fail(
          'pikku.config.json',
          pikkuConfigResult.reason === 'missing' ? 'not found' : 'invalid JSON'
        )
      )
    } else if (!pikkuConfigResult.value.addon) {
      checks.push(fail('pikku.config.json', 'addon: true not set'))
    } else {
      checks.push(pass('pikku.config.json', 'addon: true'))
    }

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

    const funcsMetaResult = await readJsonSafe<Record<string, unknown>>(
      join(distPikku, 'function', 'pikku-functions-meta.gen.json')
    )
    const funcCount = funcsMetaResult.ok
      ? Object.keys(funcsMetaResult.value).length
      : 0
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

    const schemasDir = join(distPikku, 'schemas', 'schemas')
    checks.push(
      pass('schemas dir', existsSync(schemasDir) ? 'present' : 'empty (ok)')
    )

    if (!existsSync(join(addonDir, 'README.md'))) {
      checks.push(fail('README.md', 'missing'))
    } else {
      checks.push(pass('README.md'))
    }

    const consoleMetaResult = await readJsonSafe<{
      package?: { icon?: string }
    }>(join(distPikku, 'console', 'pikku-addon-meta.gen.json'))
    const icon = consoleMetaResult.ok
      ? consoleMetaResult.value.package?.icon
      : undefined
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
