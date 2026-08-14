import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { serializeScorerNames } from './serialize-scorer-names.js'

export const pikkuAIScorer = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { scorers } = await getInspectorState()
    const {
      scorerWiringsFile,
      scorerWiringMetaFile,
      scorerWiringMetaJsonFile,
      scorerNamesDeclarationFile,
      packageMappings,
      schema,
      addonName,
    } = config

    const scorerFiles = scorers.files as Map<
      string,
      { path: string; exportedName: string }
    >

    // Written even when empty: the agent types file imports ScorerName
    // unconditionally, so a project with no scorers still has to typecheck.
    await writeFileInDir(
      logger,
      scorerNamesDeclarationFile,
      serializeScorerNames(scorers.scorersMeta)
    )

    if (
      scorerFiles.size === 0 ||
      Object.keys(scorers.scorersMeta).length === 0
    ) {
      return undefined
    }

    const lines: string[] = []
    lines.push(`import { addAIScorer } from '@pikku/core/ecosystem/ai-scorer'`)

    // Ahead of the registrations: addAIScorer refuses a scorer whose metadata
    // has not landed yet.
    lines.push(
      `import '${getFileImportRelativePath(scorerWiringsFile, scorerWiringMetaFile, packageMappings)}'`
    )

    const sortedScorers = Array.from(scorerFiles.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
    for (const [, { path, exportedName }] of sortedScorers) {
      const importPath = getFileImportRelativePath(
        scorerWiringsFile,
        path,
        packageMappings
      )
      lines.push(`import { ${exportedName} } from '${importPath}'`)
    }
    lines.push('')

    const packageArg = addonName ? `, '${addonName}'` : ''
    for (const [scorerName, { exportedName }] of sortedScorers) {
      lines.push(`addAIScorer('${scorerName}', ${exportedName}${packageArg})`)
    }
    await writeFileInDir(logger, scorerWiringsFile, lines.join('\n'))

    await writeFileInDir(
      logger,
      scorerWiringMetaJsonFile,
      JSON.stringify({ scorersMeta: scorers.scorersMeta }, null, 2)
    )

    const jsonImportPath = getFileImportRelativePath(
      scorerWiringMetaFile,
      scorerWiringMetaJsonFile,
      packageMappings
    )
    const importStatement = schema?.supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    await writeFileInDir(
      logger,
      scorerWiringMetaFile,
      `import { pikkuState } from '@pikku/core/ecosystem'
import type { ScorerMeta } from '@pikku/core/ecosystem/ai-scorer'
${importStatement}
pikkuState(${addonName ? `'${addonName}'` : 'null'}, 'agent', 'scorersMeta', metaData.scorersMeta as ScorerMeta)`
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding AI scorers',
      commandEnd: 'Found AI scorers',
    }),
  ],
})
