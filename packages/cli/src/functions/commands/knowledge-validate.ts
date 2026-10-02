import { pikkuSessionlessFunc } from '#pikku/function'
import { ErrorCode } from '@pikku/inspector'
import { runKnowledgeValidate } from '@pikku/knowledge'
import { renderKnowledgeValidate } from '../knowledge/render.js'
import {
  KnowledgeValidateInputSchema,
  KnowledgeValidateOutputSchema,
} from '../knowledge/schemas.js'

export const knowledgeValidate = pikkuSessionlessFunc({
  description:
    'Check the knowledge base against the app-project profile: every note typed, every section indexed, every slice gated, and every resource: pointing at something that still exists.',
  input: KnowledgeValidateInputSchema,
  output: KnowledgeValidateOutputSchema,
  func: async ({ config, logger }) => {
    const result = await runKnowledgeValidate(config.rootDir, config.outDir)
    const orphans = result.findings.filter((f) =>
      f.id.startsWith('knowledge-orphan-')
    )
    if (orphans.length) {
      // One diagnostic, not one per orphan: a project with no knowledge base
      // reports every function it has. The renderer lists them; this is what
      // `--fail-on-warn` gates on.
      logger.diagnostic({
        severity: 'warn',
        code: ErrorCode.KNOWLEDGE_NOTE_MISSING,
        message: `${orphans.length} thing${orphans.length !== 1 ? 's' : ''} in the code that no note describes`,
      })
    }
    // The inspection summary is what turns a blocking diagnostic into a
    // failure, and this command never reaches it.
    if (logger.hasBlockingDiagnostics()) process.exitCode = 1
    return result
  },
})

export { renderKnowledgeValidate }
