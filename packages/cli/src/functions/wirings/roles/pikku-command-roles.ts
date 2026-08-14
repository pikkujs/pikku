import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRolesTypes } from './serialize-roles-types.js'
import { validateAndBuildSystemRoleDefinitionsMeta } from '@pikku/core/ecosystem/role'

export const pikkuRoles = pikkuSessionlessFunc<{ bootstrap?: boolean }, void>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { rolesFile, rolesMetaJsonFile } = config

    if (!rolesFile) {
      return
    }

    // Same cold-start reasoning as Scopes: on a bare .pikku this runs before
    // pikku-types.gen.ts exists, so it takes the zero state. The file only has
    // to exist so personas can import SystemRoleName; the real Roles step
    // regenerates it with the declarations once setup has run.
    const bootstrap = data?.bootstrap ?? false
    const state = await getInspectorState(false, bootstrap, bootstrap)

    const content = serializeRolesTypes({
      definitions: state.systemRoles.definitions,
    })
    await writeFileInDir(logger, rolesFile, content)

    if (rolesMetaJsonFile) {
      const meta = validateAndBuildSystemRoleDefinitionsMeta(
        state.systemRoles.definitions
      )
      await writeFileInDir(
        logger,
        rolesMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuRoles types',
      commandEnd: 'Created PikkuRoles types',
    }),
  ],
})
