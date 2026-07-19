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

      const hasIndividual =
        Object.keys(state.permissions.definitions).length > 0

      if (hasIndividual) {
        const metaData = state.permissionsGroupsMeta

        await writeFileInDir(
          logger,
          config.permissionsGroupsMetaJsonFile,
          JSON.stringify(metaData, null, 2)
        )

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
