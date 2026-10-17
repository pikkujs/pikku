import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { readModuleSpecifiersOf } from '../../inspector-helpers.js'
import { collectAppSources } from './app-sources.js'
import type { ValidateFinding } from './virtual-user-checks.js'

/**
 * The specifiers that reach the retired re-export hub: the bare namespace, and
 * the hub as a deep file. Every other `#pikku/*` is a leaf or a generated
 * client and resolves to exactly what it names.
 */
const isBarrel = (specifier: string) =>
  specifier === '#pikku' || /^#pikku\/pikku-types\.gen(\.js)?$/.test(specifier)

/**
 * `#pikku` is the app tier's only door onto Pikku, and it is a namespace rather
 * than a module: `#pikku/http`, `#pikku/workflow`, one subpath per wiring.
 *
 * The bare specifier used to resolve to a hub that re-exported every wiring
 * leaf with `export *`, undoing the split the leaves exist for. Neither
 * consumer could drop the result again: bundlers keep `export *` chains unless
 * the package declares `sideEffects`, and Node and tsx do not tree-shake at
 * all — so an app with no queues still executed `@pikku/core/queue` at boot.
 */
export const runPikkuBarrelChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []

  const sources: { fileName: string; content: string }[] = []
  for (const fileName of await collectAppSources(dir)) {
    const content = await readFile(fileName, 'utf8')
    if (content.includes('#pikku')) sources.push({ fileName, content })
  }
  const specifiersOf = readModuleSpecifiersOf(sources)
  for (const [index, { fileName: file }] of sources.entries()) {
    for (const specifier of specifiersOf[index]!.filter(isBarrel)) {
      findings.push({
        id: 'pikku-barrel-import',
        severity: 'error',
        message: `${relative(dir, file)} imports '${specifier}' — the app tier reaches Pikku through one subpath per wiring, and a barrel pulls every wiring's core dependencies into the module graph`,
        path: file,
        fixHint:
          "Import from the leaf the name belongs to — '#pikku/function' for pikkuFunc, '#pikku/http' for wireHTTP, '#pikku/workflow' for workflow wiring",
      })
    }
  }

  return findings
}
