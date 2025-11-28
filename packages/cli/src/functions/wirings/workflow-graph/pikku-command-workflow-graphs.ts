import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuWorkflowGraphs: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const { workflowGraphs } = await getInspectorState()
    const { workflowGraphsMetaJsonFile } = config

    const hasGraphs = Object.keys(workflowGraphs.meta).length > 0

    if (!hasGraphs) {
      return undefined
    }

    if (workflowGraphsMetaJsonFile) {
      await writeFileInDir(
        logger,
        workflowGraphsMetaJsonFile,
        JSON.stringify(workflowGraphs.meta, null, 2),
        { ignoreModifyComment: true }
      )
    }

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Workflow graphs metadata',
      commandEnd: 'Generated Workflow graphs metadata',
    }),
  ],
})
