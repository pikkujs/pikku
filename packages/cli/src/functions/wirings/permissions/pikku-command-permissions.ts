import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePermissionsImports } from './serialize-permissions-imports.js'

export const pikkuPermissions: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { permissions } = state
    const { permissionsFile, packageMappings } = config

    let filesGenerated = false

    // Check if there are any permission group factories
    const hasHTTPFactories = Array.from(
      state.http.routePermissions.values()
    ).some((meta) => meta.exportName && meta.isFactory)
    const hasTagFactories = Array.from(
      state.permissions.tagPermissions.values()
    ).some((meta) => meta.exportName && meta.isFactory)
    const hasFactories = hasHTTPFactories || hasTagFactories

    // Generate permissions imports file if there are factories
    if (hasFactories) {
      await writeFileInDir(
        logger,
        permissionsFile,
        serializePermissionsImports(
          permissionsFile,
          permissions,
          state.http,
          packageMappings
        )
      )
      filesGenerated = true
    }

    return filesGenerated
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing Pikku permissions',
      commandEnd: 'Serialized Pikku permissions',
    }),
  ],
})
