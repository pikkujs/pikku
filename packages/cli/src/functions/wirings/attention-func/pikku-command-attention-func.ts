import { readFile } from 'node:fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { findSourceFiles } from '../../../utils/find-source-files.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  attentionFuncsMeta,
  checkAttentionFuncs,
  readAttentionFuncs,
  type AttentionFuncProblem,
  type FoundAttentionFunc,
} from './serialize-attention-funcs.js'

export const pikkuAttentionFuncs = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const {
      attentionFuncWiringsFile,
      attentionFuncMetaFile,
      attentionFuncMetaJsonFile,
      packageMappings,
      schema,
      addonName,
      rootDir,
      sourceDirs,
      ignoreFiles,
    } = config

    const files = await findSourceFiles(
      rootDir,
      sourceDirs,
      ignoreFiles ?? [],
      '**/*.ts'
    )
    const found: FoundAttentionFunc[] = []
    const problems: AttentionFuncProblem[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (!source.includes('pikkuAttentionFunc')) continue
      const read = readAttentionFuncs(file, source)
      found.push(...read.found)
      problems.push(...read.problems)
    }
    if (found.length === 0 && problems.length === 0) return undefined

    const { studio } = await getInspectorState()
    const plugin = addonName ?? studio?.title ?? 'this project'
    problems.push(
      ...checkAttentionFuncs(
        plugin,
        found,
        (studio?.arrangedScreens ?? []).map((screen) => ({
          id: screen.id,
          slots: screen.slots.map((slot) => slot.widget),
        }))
      )
    )
    for (const problem of problems) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `${problem.message} (${problem.file})`
      )
    }
    if (problems.length > 0) return undefined

    const sorted = [...found].sort((a, b) => a.widget.localeCompare(b.widget))
    const meta = attentionFuncsMeta(sorted)

    const lines = [
      `import { addAttentionFunc } from '@pikku/core/attention-func'`,
      `import '${getFileImportRelativePath(attentionFuncWiringsFile, attentionFuncMetaFile, packageMappings)}'`,
    ]
    for (const { file, exportedName } of sorted) {
      lines.push(
        `import { ${exportedName} } from '${getFileImportRelativePath(attentionFuncWiringsFile, file, packageMappings)}'`
      )
    }
    lines.push('')
    const packageArg = addonName ? `, '${addonName}'` : ''
    for (const { widget, exportedName } of sorted) {
      lines.push(`addAttentionFunc('${widget}', ${exportedName}${packageArg})`)
    }
    await writeFileInDir(logger, attentionFuncWiringsFile, lines.join('\n'))

    await writeFileInDir(
      logger,
      attentionFuncMetaJsonFile,
      JSON.stringify({ attentionFuncsMeta: meta }, null, 2)
    )
    const jsonImportPath = getFileImportRelativePath(
      attentionFuncMetaFile,
      attentionFuncMetaJsonFile,
      packageMappings
    )
    const importStatement = schema?.supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`
    await writeFileInDir(
      logger,
      attentionFuncMetaFile,
      `import { pikkuState } from '@pikku/core/state'
import type { AttentionFuncMeta } from '@pikku/core/attention-func'
${importStatement}
pikkuState(${addonName ? `'${addonName}'` : 'null'}, 'attention', 'meta', metaData.attentionFuncsMeta as AttentionFuncMeta)`
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding attention funcs',
      commandEnd: 'Found attention funcs',
    }),
  ],
})
