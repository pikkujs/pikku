import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePermissionsImports } from './serialize-permissions-imports.js'

export const pikkuPermissions = pikkuSessionlessFunc<void, boolean | undefined>(
  {
    func: async ({ logger, config, getInspectorState }) => {
      const state = await getInspectorState()
      const { permissions } = state
      const { permissionsFile, packageMappings } = config

      let filesGenerated = false

      const hasHTTPGroups = state.http.routePermissions.size > 0
      const hasTagGroups = state.permissions.tagPermissions.size > 0
      const hasIndividual =
        Object.keys(state.permissions.definitions).length > 0

      if (hasHTTPGroups || hasTagGroups || hasIndividual) {
        const metaData = state.permissionsGroupsMeta

        await writeFileInDir(
          logger,
          config.permissionsGroupsMetaJsonFile,
          JSON.stringify(metaData, null, 2)
        )

        filesGenerated = true
      }

      const hasHTTPFactories = Array.from(
        state.http.routePermissions.values()
      ).some((meta: any) => meta.exportName && meta.isFactory)
      const hasTagFactories = Array.from(
        state.permissions.tagPermissions.values()
      ).some((meta: any) => meta.exportName && meta.isFactory)

      if (hasHTTPFactories || hasTagFactories) {
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
  }
)
